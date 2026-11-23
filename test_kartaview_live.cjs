async function testKartaViewLive() {
  const tests = [
    { name: 'San Francisco (Global Reference)', lat: 37.7749, lng: -122.4194 },
    { name: 'Bengaluru MG Road', lat: 12.9755, lng: 77.6067 },
    { name: 'Bengaluru Peenya', lat: 13.0401, lng: 77.5278 },
    { name: 'Bengaluru Hebbal', lat: 13.0382, lng: 77.5919 },
    { name: 'Bengaluru Electronic City', lat: 12.8436, lng: 77.6686 },
    { name: 'Bengaluru Whitefield', lat: 12.9957, lng: 77.7579 }
  ];

  for (const t of tests) {
    const url = `https://api.kartaview.org/2.0/photo/?lat=${t.lat}&lng=${t.lng}&radius=500`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RoadGuard-AI/2.0' },
        signal: AbortSignal.timeout(8000)
      });
      const data = await res.json();
      const photos = data.result?.data || data.photos || data.data || [];
      console.log(t.name, 'Status:', res.status, 'Total photos:', photos.length, 'totalItems:', data.totalItems);
      if (photos.length > 0) {
        console.log('  First photo keys:', Object.keys(photos[0]));
        console.log('  Sample photo:', photos[0].id, photos[0].shotDate, photos[0].heading, photos[0].imagePath || photos[0].fileurlTh || photos[0].fileurlProc);
      }
    } catch (e) {
      console.log(t.name, 'ERROR:', e.message);
    }
  }
}
testKartaViewLive();
