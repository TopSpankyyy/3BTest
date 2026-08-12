const js = (await Bun.file('./bundle.js').text()).replaceAll('</script', '<\\/script');
const css = await Bun.file('./output.css').text();
const routePath = JSON.stringify(process.env.ROUTE_PATH ?? '').replaceAll('</script', '<\\/script');
const branchId = JSON.stringify(process.env._3B_BRANCH_ID ?? '').replaceAll('</script', '<\\/script');

console.log(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <script>try{document.documentElement.dataset.theme=localStorage.getItem('arc-theme')||'dark';}catch(e){}</script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Globex Corporation — New Hire Onboarding Portal</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>window.__ROUTE_PATH__=${routePath};window.__BRANCH_ID__=${branchId};</script>
  <script type="module">${js}</script>
</body>
</html>`);
