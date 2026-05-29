import { JSONFilePreset } from 'lowdb/node';

const defaultData = { articles: [] };
const db = await JSONFilePreset('db.json', defaultData);

/**
 * 💡 ADVANCED REGEX: 漢字(よみがな) သို့မဟုတ် ကတ္တရု(よみがな) ပုံစံအားလုံးကို 
 * လုံးဝအမှားအယွင်းမရှိ သန့်ရှင်းသော HTML <ruby> tag အဖြစ် ပြောင်းလဲပေးသည့်စနစ်
 */
function cleanAndConvertToRuby(text) {
    if (!text) return text;
    
    // အရင်ဆုံး ကွင်းစကွင်းပိတ်အတွင်းထဲတွင် ruby tag များ ထပ်နေပါက ရှင်းထုတ်ပစ်ရန်
    let cleaned = text.replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/g, '$1');
    
    // 漢字(よみがな) သို့မဟုတ် 英数(よみがな) ပုံစံများကို ဖမ်းယူပြီး ပြောင်းလဲခြင်း
    return cleaned.replace(/([一-龠々〆ヶa-zA-Z0-9]+)[\(（]([ぁ-んァ-ヶー]+)[\)）]/g, '<ruby>$1<rt>$2</rt></ruby>');
}

async function runMigration() {
    console.log("🔄 Starting Advanced Database Formatting Migration...");
    await db.read();

    if (!db.data.articles || db.data.articles.length === 0) {
        console.log("ℹ️ No articles found in db.json to convert.");
        return;
    }

    let modifiedCount = 0;

    db.data.articles = db.data.articles.map(article => {
        if (article.aiContent) {
            if (article.aiContent.simplify) {
                article.aiContent.simplify = cleanAndConvertToRuby(article.aiContent.simplify);
            }
            if (article.aiContent.summary) {
                article.aiContent.summary = cleanAndConvertToRuby(article.aiContent.summary);
            }
            if (article.aiContent.furigana) {
                article.aiContent.furigana = cleanAndConvertToRuby(article.aiContent.furigana);
            }
            modifiedCount++;
        }
        return article;
    });

    if (modifiedCount > 0) {
        await db.write();
        console.log(`✅ Success! Cleaned and formatted all ${modifiedCount} articles smoothly.`);
    }
}

runMigration();