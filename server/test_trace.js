const axios = require('axios');

async function testBackend() {
  console.log('🚀 Testing the FlowScope Backend Trace API...\n');

  try {
    // Mimicking the request the frontend will send when a user investigates a company
    const payload = {
      companyName: "skoda auto",
      companyCountry: "Czech Republic",
      targetHsCode: "8708", // Parts and accessories for motor vehicles
      hsnDescription: "Parts and accessories for tractors and motor vehicles",
      currentTier: 1
    };

    console.log(`Sending Trace Request to expand Tier-1 suppliers for ${payload.companyName}...`);
    
    // Call our newly created route
    const response = await axios.post('http://localhost:3001/api/trace/expand', payload);
    
    console.log('\n✅ Backend Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.data);
    } else {
      console.error('❌ Connection Error:', error.message);
      console.log('Hint: Make sure the server is running on port 3001! (npm run start)');
    }
  }
}

testBackend();
