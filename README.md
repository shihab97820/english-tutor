# English Tutor 🎤

বাংলাভাষীদের জন্য ইংরেজিতে কথা বলার অনুশীলনের অ্যাপ। এখানে একজন ধৈর্যশীল AI শিক্ষক আছে।
অ্যাপটা একটা PWA। GitHub Pages-এ চলে, আর PWABuilder দিয়ে Android APK বানানো যায়।

## ফোল্ডার কাঠামো

| ফাইল | কাজ |
|---|---|
| `index.html` | সব স্ক্রিন (Home, মেনু, কথোপকথন, ভুল, শব্দ খাতা, সেভ করা বাক্য, সেটিংস) |
| `css/style.css` | ডিজাইন আর অ্যাভাটারের অ্যানিমেশন |
| `js/storage.js` | ফোনে ডেটা রাখা, সেটিংস, লেভেল, শব্দ খাতা, বুকমার্ক |
| `js/avatar.js` | ৩টা অ্যাভাটার (নারী, পুরুষ, রোবট) |
| `js/speech.js` | মাইক (continuous mode, চুপ থাকার টাইমার) আর বাংলা/ইংরেজি কণ্ঠ |
| `js/prompts.js` | **শিক্ষকের নিয়ম (system prompt)**। আচরণ বদলাতে চাইলে এখানে বদলাও |
| `js/ai.js` | Gemini / Claude-এর সাথে যোগাযোগ |
| `js/mistakes.js` | ভুল সেভ করা, ১/৩/৭ দিন পর রিভিউ |
| `js/tutor.js` | Home-এর মূল অংশ: বলা, শোনা, বোতাম |
| `js/practice.js` | অনুবাদ অনুশীলন |
| `js/roleplay.js` | কথোপকথন (role-play) |
| `js/settings.js` | সেটিংস আর মেনুর তালিকাগুলো |
| `js/app.js` | Back বোতাম, ডায়ালগ, ইন্টারনেট না থাকলে কী হবে, অ্যাপ চালু |
| `sw.js` | Service worker: অফলাইন কপি আর নিজে থেকে আপডেট |
| `manifest.webmanifest` | অ্যাপের নাম আর আইকন (PWABuilder এটা পড়ে) |

## কোড আপডেট করলে ফোনের অ্যাপ নিজে থেকে আপডেট হয় কীভাবে

`sw.js` সবসময় আগে ইন্টারনেট থেকে নতুন ফাইল আনে ("network first")। পুরোনো কপি চালায় শুধু ইন্টারনেট না থাকলে।
তাই GitHub-এ push করার ১–২ মিনিট পর অ্যাপ বন্ধ করে আবার খুললেই নতুন ভার্সন চলে আসবে।
APK আবার install করতে হবে না। ভালো অভ্যাস হিসেবে বড় পরিবর্তনের পর এগুলো একটু বাড়িয়ে দিও:
`sw.js`-এর `VERSION` আর `js/app.js`-এর `APP_VERSION`।

> APK আবার বানাতে হবে শুধু অ্যাপের **নাম, আইকন বা package** বদলালে।

## ফোনে API key (একবারই করতে হবে)

1. ফোনের Chrome-এ যাও **aistudio.google.com/apikey**। Google account দিয়ে ঢোকো।
2. **Create API key** চাপো, তারপর key-টা কপি করো।
3. অ্যাপে যাও: **মেনু → সেটিংস → Gemini API key**। key-টা পেস্ট করো, তারপর **✔ key পরীক্ষা করো** চাপো।

## বাংলা কণ্ঠ না শোনা গেলে

ফোনের **Settings → System → Languages → Text-to-speech output → Preferred engine: Speech Services by Google → ⚙️ → Install voice data → Bengali (Bangladesh)** ডাউনলোড করো।
(মেনুর নাম ফোনভেদে একটু আলাদা হতে পারে। Settings-এ "Text-to-speech" লিখে খুঁজলেও পাবে।)
