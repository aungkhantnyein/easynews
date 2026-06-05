import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import { JSONFilePreset } from 'lowdb/node';
import ogs from 'open-graph-scraper';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new Parser();

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("⚠️ Error: GEMINI_API_KEY is missing in your .env file.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const defaultData = { articles: [] };
const db = await JSONFilePreset('db.json', defaultData);

const CATEGORY_IMAGES = {
  sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=600&auto=format&fit=crop',
  technology: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop',
  education: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=600&auto=format&fit=crop',
  society: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=600&auto=format&fit=crop',
  entertainment: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop',
  business: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=600&auto=format&fit=crop'
};

/**
 * 💡 UPGRADED FILTER: ကြော်ငြာ tag များနှင့် "googletag" script components များကို 
 * လုံးဝအမြစ်ပြတ် သန့်စင်ဖယ်ရှားပေးမည့် သတင်းညှစ်စနစ်
 */
async function scrapeFullArticleText(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let html = buffer.toString('utf-8');
    let charset = 'utf-8';
    
    const charsetMatch = html.match(/charset=["']?([a-zA-Z0-9-_]+)["']?/i);
    if (charsetMatch && charsetMatch[1]) {
      charset = charsetMatch[1].toLowerCase();
    }
    
    if (charset !== 'utf-8' && iconv.encodingExists(charset)) {
      html = iconv.decode(buffer, charset);
    }

    const $ = cheerio.load(html);
    
    // 💡 Scraping မလုပ်မီ HTML အတွင်းရှိ ကြော်ငြာ script block များကို cheerio ဖြင့် ကြိုတင်ဖျက်ထုတ်ခြင်း
    $('script, style, ins, iframe').remove();
    
    let articleBody = $('.articleBody').text().trim() || $('.article_body').text().trim() || $('#article-body').text().trim();
    
    if (!articleBody) {
      const paragraphs = [];
      $('p').each((i, el) => {
        const txt = $(el).text().trim();
        // Google tags သို့မဟုတ် ကြော်ငြာစာသားများပါက ဖယ်ထုတ်ရန်
        if (txt.length > 30 && !txt.includes('हीं') && !txt.includes('Share') && !txt.includes('googletag')) {
          paragraphs.push(txt);
        }
      });
      articleBody = paragraphs.slice(0, 4).join('\n');
    }
    
    // 💡 CLEANING ENGINE: googletag components များနှင့် မလိုအပ်သော စာသားများကို သန့်စင်ခြင်း
    if (articleBody) {
      articleBody = articleBody
        .replace(/googletag\.cmd\.push\(function\(\)\s*\{\s*googletag\.display\(.*?\);\s*\}\);/g, '') // 💡 Googletag ad component ဖြတ်ထုတ်ခြင်း
        .replace(/googletag.*?\}\);/g, '') // ခွဲထွက်နေသော ကျန်ရှိသည့် tag အစိတ်အပိုင်းများ ရှင်းလင်းခြင်း
        .replace(/写真拡大/g, '')
        .replace(/記事を読む/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    }
    
    return articleBody || null;
  } catch (error) {
    console.error(`⚠️ Failed to scrape web content from: ${url}`, error.message);
    return null;
  }
}

async function fetchAndProcessNews() {
  console.log("⏰ [Cron Job] Automated Real-Time News Pipeline Started...");
  const FEED_URL = 'https://news.livedoor.com/topics/rss/dom.xml';
  
  try {
    const feed = await parser.parseURL(FEED_URL);
    const topArticles = feed.items.slice(0, 5); 
    
    await db.read();
    const existingUrls = db.data.articles.map(a => a.url);
    
    let newArticlesAdded = 0;

    for (const item of topArticles) {
      if (existingUrls.includes(item.link)) continue;
      if (newArticlesAdded >= 3) break; 

      console.log(`✨ Syncing new wire data bundle: ${item.title}`);
      
      let rawJapaneseText = await scrapeFullArticleText(item.link);
      if (!rawJapaneseText || rawJapaneseText.length < 50) {
         rawJapaneseText = item.contentSnippet || item.content || item.title;
      }
      
      const textToAI = rawJapaneseText.slice(0, 800);

      const prompt = `
      あなたは日本語教師です。外国人の日本語学習者のために、提供されたニュースから指定されたJSONフォーマットを生成してください。

      JSON構造のルール:
      {
        "category": "This must be one of these exact lowercased strings: 'sports', 'education', 'society', 'technology', 'entertainment', 'business'.",
        "summary": "ニュースの重要ポイントを日本語の箇条書き（3点以内）でまとめた文章。漢字にはすべてHTMLのrubyタグ（例：<ruby>横領<rt>おうりょう</rt></ruby>）を使ってルビを振ること。改行には \\n を使用してください。",
        "translate": "Here is the accurate and natural English translation of the news article for learners.",
        "furigana": "元のニュースの「見出し（タイトル）」のすべての漢字に、HTMLのrubyタグ（例：<ruby>新<rt>あたら</rt></ruby>しい<ruby>学校<rt>がっこう</rt></ruby>）を使ってルビを完璧に振ったHTMLテキスト"
      }

      ⚠️ CRITICAL HTML RULE:
      - Never use brackets like ( ) or （ ） for readings in any field.
      - Every single Kanji character in "furigana" and "summary" MUST be wrapped in <ruby>Kanji<rt>furigana</rt></ruby> format. No skipped Kanji.
      
      ニュース記事:
      Title: ${item.title}
      Content: ${textToAI}
      `;

      let responseText = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });
          responseText = response.text;
          break;
        } catch (error) {
          console.warn(`⚠️ Gemini API Error (Attempt ${attempt}/${maxRetries}): ${error.message}`);
          if (attempt < maxRetries) {
            console.log("⏳ Server busy (503/429). Waiting 6 seconds before retrying...");
            await new Promise(resolve => setTimeout(resolve, 6000));
          } else {
            throw error;
          }
        }
      }

      try {
        if (!responseText) throw new Error("Empty AI response received.");
        const aiResult = JSON.parse(responseText);
        const mappedCategory = aiResult.category ? aiResult.category.toLowerCase() : 'society';

        let imageUrl = CATEGORY_IMAGES[mappedCategory];
        try {
          const ogsResult = await ogs({ url: item.link });
          if (ogsResult.result && ogsResult.result.ogImage && ogsResult.result.ogImage[0]) {
            imageUrl = ogsResult.result.ogImage[0].url;
            console.log(`📸 Successfully extracted real image for: ${item.title}`);
          }
        } catch (ogsError) {
          console.log(`ℹ️ OpenGraph fallback active for: ${item.title}`);
        }

        const rawDate = item.pubDate ? new Date(item.pubDate) : new Date();
        const formattedDate = rawDate.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const structuredArticle = {
          id: Date.now() + Math.random(),
          date: formattedDate,
          title: item.title,
          japanese: rawJapaneseText,
          category: mappedCategory,
          imageUrl: imageUrl,
          aiContent: {
            summary: aiResult.summary || "・ニュース概要データはありません。",
            translate: aiResult.translate || "No translation available.",
            furigana: aiResult.furigana || item.title
          },
          url: item.link
        };

        db.data.articles.unshift(structuredArticle);
        newArticlesAdded++;
        
        console.log("⏳ Adhering to Gemini Free Tier Rate limits... Sleeping for 12 seconds...");
        await new Promise(resolve => setTimeout(resolve, 12000));

      } catch (aiError) {
        console.error(`❌ AI Processing failure for asset title: ${item.title}`, aiError.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (newArticlesAdded > 0) {
      db.data.articles = db.data.articles.slice(0, 40);
      await db.write();
      console.log(`✅ Pipeline routine run complete. Synced ${newArticlesAdded} modules.`);
    } else {
      console.log("ℹ️ No new updates found on remote feed channels.");
    }

  } catch (error) {
    console.error("❌ Cron Routine Routing Failure:", error.message);
  }
}

cron.schedule('*/30 * * * *', fetchAndProcessNews);

app.get('/api/news', async (req, res) => {
  try {
    await db.read();
    res.json(db.data.articles);
  } catch (error) {
    res.status(500).json({ error: "Failed tracking database records." });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 EasyJP Backend Engine spinning up on http://localhost:${PORT}`);
  await db.read();
  if (db.data.articles.length === 0) {
    console.log("📁 Cached data array empty. Initializing batch seed instantly...");
    await fetchAndProcessNews();
  }
});
