async function test() {
  const shopId = '00b0bb64-d006-4e71-b41c-979bde62766e';
  try {
    const res = await fetch(`http://localhost:3000/api/shops/${shopId}/employees?limit=200`, {
      headers: {
        // We might need auth cookie, but let's see if we can query it directly or if it fails
      }
    });
    console.log('API Status:', res.status);
    console.log('API Body:', await res.text());
  } catch (e) {
    console.error('Error fetching API:', e);
  }
}

test();
