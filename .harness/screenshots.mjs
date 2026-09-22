export default async function run(page, ui) {
  // Click "Sign in as Farmer"
  await ui.click('@e5')
  await page.waitForTimeout(3000)

  // Take dashboard screenshot
  await page.screenshot({ path: 'C:\\Users\\RianH\\OneDrive\\Documents\\Kisan360\\.harness\\shots\\ppt-dashboard.png', fullPage: false })

  // Navigate to net-realization
  await page.goto('https://kisan360-web.onrender.com/net-realization')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'C:\\Users\\RianH\\OneDrive\\Documents\\Kisan360\\.harness\\shots\\ppt-netreal.png', fullPage: false })

  // Navigate to trade
  await page.goto('https://kisan360-web.onrender.com/trade')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'C:\\Users\\RianH\\OneDrive\\Documents\\Kisan360\\.harness\\shots\\ppt-trade.png', fullPage: false })

  // Navigate to grade-crop
  await page.goto('https://kisan360-web.onrender.com/grade-crop')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'C:\\Users\\RianH\\OneDrive\\Documents\\Kisan360\\.harness\\shots\\ppt-grade.png', fullPage: false })

  return { status: 'done', pages: ['dashboard', 'net-realization', 'trade', 'grade-crop'] }
}
