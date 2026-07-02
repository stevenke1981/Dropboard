/**
 * 古籍掃描 PDF 下載工具
 *
 * 從中國哲學書電子化計劃 (ctext.org) 獲取四庫全書掃描版 PDF，
 * 實際檔案託管於 Internet Archive。
 *
 * 用法: node download-pdf.js
 *        node download-pdf.js <res-id> [輸出目錄]
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

let OUT_DIR = path.resolve(__dirname, '..', '..', '古籍-pdf');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 要下載的經典清單
// 格式: [ctext-res-id, 書名, 卷數描述]
const BOOKS = [
  ['658',  '詩經集傳',   '朱熹集傳, 4冊'],
  ['6670', '莊子',       '四庫全書薈要本, 5冊'],
  ['667',  '周易窺餘',   '四庫全書本, 6冊 (易經相關)'],
  ['5097', '論語注疏',   '四庫全書本, 5冊'],
  ['595',  '書經集傳',   '四庫全書本, 3冊'],
  ['6655', '管子',       '四庫全書薈要本, 8冊'],
  ['598',  '夢溪筆談',   '四庫全書本, 5冊'],
  ['3119', '群書治要',   '北大藏本, 24冊'],
  ['2725', '本草求真',   '清黃宮繡撰'],
  ['5659', '傷寒論注釋', '四庫全書本, 3冊 (張仲景)'],
  ['5782', '九章算術',   '四庫全書本, 3冊'],
];

// ─── 工具：HTML 擷取 ───────────────
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dropboard/1.0)' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function getIALinks(html) {
  const ids = new Set();
  const matches = [...html.matchAll(/https?:\/\/www\.archive\.org\/download\/([^\s"'<>]+?)\./g)];
  for (const m of matches) {
    let id = m[1].replace(/\.$/, '');
    ids.add(id);
  }
  return [...ids];
}

// ─── 下載 (含重試) ──────────────────
function downloadPDF(url, destPath, volLabel, retries = 3) {
  return new Promise((resolve, reject) => {
    // 檢查是否已存在且有效
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 102400) {
      const mb = (fs.statSync(destPath).size / 1048576).toFixed(1);
      console.log(`  ${volLabel}: ⏭️  ${mb} MB (已存在)`);
      return resolve(true);
    }

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    let attempts = 0;

    function doGet(targetUrl) {
      attempts++;
      protocol.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dropboard/1.0)' },
        timeout: 30000,
      }, res => {
        // 302 redirect → follow
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doGet(res.headers.location);
          return;
        }

        // 503 (rate limit) → retry
        if (res.statusCode === 503) {
          file.close();
          try { fs.unlinkSync(destPath); } catch(e) {}
          if (attempts <= retries) {
            const wait = 10000 * attempts;
            console.log(`  ${volLabel}: ⏳ 503 (rate limit), 等待 ${wait/1000}s 後重試 (${attempts}/${retries})`);
            setTimeout(() => doGet(targetUrl), wait);
            return;
          }
          return reject(new Error(`503 after ${retries} retries`));
        }

        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch(e) {}
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastLog = Date.now();

        res.on('data', chunk => {
          downloaded += chunk.length;
          file.write(chunk);
          const now = Date.now();
          if (now - lastLog > 3000) {
            const pct = total > 0 ? `${(downloaded/total*100).toFixed(0)}%` : `${(downloaded/1048576).toFixed(1)}MB`;
            process.stdout.write(`\r  ${volLabel}: ${pct}`);
            lastLog = now;
          }
        });

        res.on('end', () => {
          file.end();
          if (total > 0) process.stdout.write('\r'.padEnd(50));
          const mb = (downloaded / 1048576).toFixed(1);
          console.log(`  ${volLabel}: ✅ ${mb} MB`);
          resolve(true);
        });

        res.on('error', err => {
          file.close();
          try { fs.unlinkSync(destPath); } catch(e) {}
          reject(err);
        });
      }).on('error', err => {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        reject(err);
      }).on('timeout', function() {
        this.destroy();
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        if (attempts <= retries) {
          const wait = 5000 * attempts;
          console.log(`  ${volLabel}: ⏳ timeout, 等待 ${wait/1000}s 後重試 (${attempts}/${retries})`);
          setTimeout(() => doGet(targetUrl), wait);
        } else {
          reject(new Error('timeout'));
        }
      });
    }
    doGet(url);
  });
}

// ─── 主流程 ──────────────────────────
async function main() {
  const args = process.argv.slice(2);
  let booksToDownload = BOOKS;
  if (args.length > 0) {
    const resId = args[0];
    const customDir = args[1] || OUT_DIR;
    const book = BOOKS.find(b => b[0] === resId);
    booksToDownload = [[resId, book ? book[1] : `res-${resId}`, book ? book[2] : '']];
    if (args[1]) OUT_DIR = path.resolve(args[1]);
  }

  console.log('══════════════════════════════════════════════');
  console.log('  古籍掃描 PDF 下載');
  console.log('  來源: ctext.org → Internet Archive');
  console.log(`  輸出: ${OUT_DIR}`);
  console.log('══════════════════════════════════════════════\n');

  let totalVolumes = 0;
  let totalBytes = 0;

  for (const [resId, shortName, note] of booksToDownload) {
    console.log(`📖 ${shortName} (res=${resId}) — ${note}`);
    console.log('   讀取 CText 頁面...');

    try {
      const html = await fetchHtml(`https://ctext.org/library.pl?if=gb&res=${resId}`);
      const ids = getIALinks(html);

      if (ids.length === 0) {
        console.log('   ⚠️  未找到下載連結，跳過\n');
        continue;
      }

      console.log(`   找到 ${ids.length} 卷`);

      const safeName = shortName.replace(/[/\\:]/g, '_');
      const bookDir = path.join(OUT_DIR, `${safeName}_${resId}`);
      fs.mkdirSync(bookDir, { recursive: true });

      for (let i = 0; i < ids.length; i++) {
        const volLabel = String(i + 1).padStart(2, '0');
        const fileName = `${volLabel}_${ids[i]}.pdf`;
        const destPath = path.join(bookDir, fileName);
        const pdfUrl = `https://archive.org/download/${ids[i]}/${ids[i]}.pdf`;

        try {
          await downloadPDF(pdfUrl, destPath, volLabel);
          if (fs.existsSync(destPath)) totalBytes += fs.statSync(destPath).size;
          totalVolumes++;
        } catch (err) {
          console.log(`  ${volLabel}: ❌ ${err.message}`);
        }

        // 每卷間隔 3 秒避免觸發限制
        if (i < ids.length - 1) await new Promise(r => setTimeout(r, 3000));
      }

      const bookMB = (fs.readdirSync(bookDir).reduce((sum, f) => {
        try { return sum + (fs.statSync(path.join(bookDir, f)).size || 0); } catch(e) { return sum; }
      }, 0) / 1048576).toFixed(0);
      console.log(`   📊 ${shortName}: ${bookMB} MB\n`);

    } catch (err) {
      console.log(`   ❌ 讀取失敗: ${err.message}\n`);
    }
  }

  console.log('══════════════════════════════════════════════');
  console.log('✅ 下載完成');
  console.log(`📚 ${totalVolumes} 冊`);
  console.log(`💾 ${(totalBytes / 1073741824).toFixed(2)} GB`);
  console.log('══════════════════════════════════════════════\n');
  console.log('💡 可自行加入更多經典到 BOOKS 陣列。');
  console.log('   或: node download-pdf.js <res-id> [目錄]');
}

main().catch(err => {
  console.error('\n❌ 錯誤:', err.message);
  process.exit(1);
});
