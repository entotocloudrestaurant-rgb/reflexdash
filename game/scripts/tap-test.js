// Browser-side tapping script for verifying scoring works
(async () => {
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  let totalTapped = 0;
  for (let i = 0; i < 12; i++) {
    const targets = document.querySelectorAll('button[aria-label="Target"]');
    if (targets.length === 0) {
      await sleep(300);
      continue;
    }
    targets[0].click();
    totalTapped++;
    await sleep(400);
  }
  // Read score from page text
  const body = document.body.innerText;
  return JSON.stringify({ tapped: totalTapped, bodySnippet: body.slice(0, 200) });
})();
