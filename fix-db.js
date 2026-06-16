import { JSONFilePreset } from 'lowdb/node';

// db.json ကို လှမ်းဖတ်ခြင်း
const defaultData = { articles: [] };
const db = await JSONFilePreset('db.json', defaultData);

/**
 * 漢字(ふりがな) အား HTML <ruby> tag သို့ ပြောင်းလဲပေးမည့် Function
 */
function convertToRubyTags(text) {
    if (!text) return text;
    // Regex သုံးပြီး 漢字(ふりがな) ကို ရှာကာ <ruby>漢字<rt>ふりがな</rt></ruby> သို့ လဲလှယ်ခြင်း
    return text.replace(/([亜-熙々]+)[\(（]([ぁ-んァ-ヶ]+)[\)）]/g, '<ruby>$1<rt>$2</rt></ruby>');
}

async function fixDatabase() {
    console.log("🔄 Reading db.json and applying automated fixes...");
    await db.read();

    if (!db.data.articles || db.data.articles.length === 0) {
        console.log("ℹ️ No articles found to fix.");
        return;
    }

    let fixedCount = 0;

    db.data.articles = db.data.articles.map(article => {
        let hasChanged = false;

        // 💡 FIX 1: "記事を読む" ဖြစ်နေပါက သတင်းခေါင်းစဉ်ဖြင့် အစားထိုးလဲလှယ်ခြင်း
        if (!article.japanese || article.japanese.trim() === "" || article.japanese.includes("記事を読む")) {
            article.japanese = article.title;
            hasChanged = true;
        }

        // 💡 FIX 2: Bracket Furigana များကို <ruby> tag သို့ ပြောင်းလဲခြင်း
        if (article.aiContent) {
            if (article.aiContent.simplify && article.aiContent.simplify.includes('(')) {
                article.aiContent.simplify = convertToRubyTags(article.aiContent.simplify);
                hasChanged = true;
            }
            if (article.aiContent.furigana && article.aiContent.furigana.includes('(')) {
                article.aiContent.furigana = convertToRubyTags(article.aiContent.furigana);
                hasChanged = true;
            }
        }

        if (hasChanged) fixedCount++;
        return article;
    });

    if (fixedCount > 0) {
        await db.write();
        console.log(`✅ Success! Effectively fixed and formatted ${fixedCount} articles.`);
        console.log("ℹ️ You can now run 'node --env-file=.env server.js' and test the web app!");
    } else {
        console.log("ℹ️ Database is already perfectly formatted. No fixes needed.");
    }
}

fixDatabase();
