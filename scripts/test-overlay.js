const puppeteer = require('puppeteer');

(async () => {
  const url = 'https://book.sciencereading.cn/shop/book/Booksimple/onlineRead.do?id=B1EAF8231405DA629E063020B0A0A02C7000&readMark=0';

  console.log('启动浏览器...');
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('打开页面:', url);
  const page = await browser.newPage();

  // 等待页面加载
  await page.goto(url, { waitUntil: 'networkidle2' });
  console.log('页面加载完成，等待 PDF 渲染...');

  // 等待一下让 PDF 和覆盖层都渲染出来
  await page.waitForTimeout(5000);

  // 检查覆盖层
  console.log('\n=== 执行前检查 ===');
  const beforeCount = await page.evaluate(() => {
    const noPermEls = document.querySelectorAll('[id^="noPerm"]');
    const overlayEls = document.querySelectorAll('.custom-overlay');
    console.log('noPerm 元素数量:', noPermEls.length);
    console.log('custom-overlay 元素数量:', overlayEls.length);

    // 列出找到的元素
    noPermEls.forEach(el => console.log('  - noPerm:', el.id, el.className));
    overlayEls.forEach(el => console.log('  - overlay:', el.className));

    return { noPerm: noPermEls.length, overlay: overlayEls.length };
  });

  // 执行移除操作
  console.log('\n=== 移除覆盖层 ===');
  await page.evaluate(() => {
    // 移除所有 id 以 noPerm 开头的元素
    document.querySelectorAll('[id^="noPerm"]').forEach(el => {
      console.log('移除:', el.id);
      el.remove();
    });

    // 移除所有 class 包含 custom-overlay 的节点
    document.querySelectorAll('.custom-overlay').forEach(el => {
      console.log('移除:', el.className);
      el.remove();
    });
  });

  // 验证移除结果
  console.log('\n=== 执行后检查 ===');
  const afterCount = await page.evaluate(() => {
    const noPermEls = document.querySelectorAll('[id^="noPerm"]');
    const overlayEls = document.querySelectorAll('.custom-overlay');
    return { noPerm: noPermEls.length, overlay: overlayEls.length };
  });

  console.log('noPerm 元素数量:', afterCount.noPerm);
  console.log('custom-overlay 元素数量:', afterCount.overlay);

  if (afterCount.noPerm === 0 && afterCount.overlay === 0) {
    console.log('\n✓ 覆盖层已全部移除');
  } else {
    console.log('\n⚠ 还有未移除的覆盖层元素');
  }

  console.log('\n=== 验证交互性 ===');
  console.log('请手动检查页面是否可以选中和交互 PDF 内容');

  // 保持浏览器打开一段时间，方便用户查看
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('脚本执行完成');
})();
