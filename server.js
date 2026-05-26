import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import { JSONFilePreset } from 'lowdb/node';
import ogs from 'open-graph-scraper';

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new Parser();

app.use(cors());
app.use(express.json());

// Initialize Gemini AI Client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("⚠️ Error: GEMINI_API_KEY is missing in your .env file.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Initialize Lowdb Local Database Cache
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
 * Core Pipeline: RSS sync -> OG Image Scraping -> AI Generation -> DB Save
 */
async function fetchAndProcessNews() {
  console.log("⏰ [Cron Job] Automated Real-Time News Pipeline Started...");
  const FEED_URL = 'https://news.livedoor.com/topics/rss/dom.xml';
  
  try {
    const feed = await parser.parseURL(FEED_URL);
    const topArticles = feed.items.slice(0, 10);
    
    await db.read();
    const existingUrls = db.data.articles.map(a => a.url);
    
    let newArticlesAdded = 0;

    for (const item of topArticles) {
      if (existingUrls.includes(item.link)) continue;
      if (newArticlesAdded >= 3) break;

      console.log(`✨ Syncing new wire data bundle: ${item.title}`);
      
      // 💡 FIXED: သတင်းစာသား လုံးဝမပါလာပါက ခေါင်းစဉ်ကိုပဲ AI ဖတ်ရန် Content အဖြစ် သတ်မှတ်ပေးလိုက်သည်
      let rawJapaneseText = item.contentSnippet || item.content || "";
      if (!rawJapaneseText || rawJapaneseText.trim() === "" || rawJapaneseText === "本文データなし") {
         rawJapaneseText = item.title; 
      }
      
      const prompt = `
      あなたは親切な日本語教師、兼ニュース編集者です。
      提供された日本語のニュース記事をもとに、外国人の日本語学習者のために以下の5つの要素を生成し、必ず指定された【JSONフォーマット】だけで出力してください。他の解説は一切含めないでください。

      JSON構造のルール:
      {
        "category": "This must be one of these exact lowercased strings: 'sports', 'education', 'society', 'technology', 'entertainment', 'business'.",
        "simplify": "ここに小学生でも読めるような「やさしい日本語」に書き換えた文章。漢字にはカタカナで半角括弧を使って「漢字(カンジ)」のようにルビを振るか、平仮名多めで書くこと。",
        "summary": "・ここに元のニュースの重要ポイントを日本語の箇条書き（3点以内）でまとめた文章1。\\n・ポイント2。\\n・ポイント3。",
        "translate": "Here is the accurate and natural English translation of the news article for learners.",
        "furigana": "ここに元のニュース記事の「見出し（タイトル）」に、すべての漢字に半角括弧で読み仮名を付けたテキスト（例：福島市(ふくしまし)で猛暑日(もうしょび)予想(よそう)）"
      }

      ニュース記事:
      Title: ${item.title}
      Content: ${rawJapaneseText}
      `;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const aiResult = JSON.parse(response.text);
        const mappedCategory = aiResult.category ? aiResult.category.toLowerCase() : 'society';

        // Scraping the real photo
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
            simplify: aiResult.simplify || "やさしい日本語データはありません。",
            summary: aiResult.summary || "・ニュース概要データはありません。",
            translate: aiResult.translate || "No translation available.",
            furigana: aiResult.furigana || item.title
          },
          url: item.link
        };

        db.data.articles.unshift(structuredArticle);
        newArticlesAdded++;
        
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (aiError) {
        console.error(`❌ AI Processing failure for asset title: ${item.title}`, aiError.message);
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