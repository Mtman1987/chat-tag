// Test script to verify API connection between StreamWeaver2 and StreamWeaver3
// Run this from StreamWeaver3 directory: node test-connection.js

const STREAMWEAVER2_URL = 'http://localhost:8090';

async function testConnection() {
  console.log('Testing connection to StreamWeaver2...');
  
  try {
    // Test auth endpoint
    console.log('\n1. Testing auth share endpoint...');
    const authResponse = await fetch(`${STREAMWEAVER2_URL}/api/auth/share`);
    if (authResponse.ok) {
      const authData = await authResponse.json();
      console.log('✅ Auth endpoint working');
      console.log('   Twitch broadcaster:', authData.twitch?.broadcasterUsername);
      console.log('   Twitch bot:', authData.twitch?.botUsername);
      console.log('   Discord bot token:', authData.discord?.botToken ? 'Present' : 'Missing');
    } else {
      console.log('❌ Auth endpoint failed:', authResponse.status);
    }
    
    // Test Discord members endpoint
    console.log('\n2. Testing Discord members endpoint...');
    const membersResponse = await fetch(`${STREAMWEAVER2_URL}/api/discord/members`);
    if (membersResponse.ok) {
      const membersData = await membersResponse.json();
      console.log('✅ Discord members endpoint working');
      console.log(`   Found ${membersData.members?.length || 0} members`);
      if (membersData.members?.length > 0) {
        console.log('   Sample member:', membersData.members[0].username);
      }
    } else {
      console.log('❌ Discord members endpoint failed:', membersResponse.status);
    }
    
    // Test Twitch live endpoint
    console.log('\n3. Testing Twitch live endpoint...');
    const liveResponse = await fetch(`${STREAMWEAVER2_URL}/api/twitch/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: ['mtman1987', 'athenabot87'] })
    });
    if (liveResponse.ok) {
      const liveData = await liveResponse.json();
      console.log('✅ Twitch live endpoint working');
      console.log(`   Found ${liveData.liveUsers?.length || 0} live users`);
    } else {
      console.log('❌ Twitch live endpoint failed:', liveResponse.status);
    }
    
    console.log('\n🎉 Connection test completed!');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.log('\nMake sure StreamWeaver2 server is running on port 8090');
  }
}

testConnection();