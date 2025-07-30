#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runDemo() {
  console.log('🎯 Running BudgetGuard Demo...\n');
  
  try {
    // Check if server is running
    console.log('🔍 Checking if server is running...');
    await axios.get('http://localhost:3000/health');
    console.log('✅ Server is running');
    
    // Create demo tenant
    const tenant = await axios.post('http://localhost:3000/admin/tenant', {
      name: 'demo',
      displayName: 'Demo Tenant'
    }, {
      headers: { 'X-Admin-Key': process.env.ADMIN_API_KEY || 'demo-admin-key' }
    });
    
    console.log('✅ Created demo tenant');
    
    // Create API key
    const apiKey = await axios.post(`http://localhost:3000/admin/tenant/${tenant.data.id}/apikeys`, {
      name: 'demo-key'
    }, {
      headers: { 'X-Admin-Key': process.env.ADMIN_API_KEY }
    });
    
    console.log('✅ Created API key');
    
    // Make AI request
    if (process.env.OPENAI_KEY) {
      const response = await axios.post('http://localhost:3000/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "BudgetGuard is working!"' }],
        max_tokens: 10
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': 'demo',
          'X-API-Key': apiKey.data.key
        }
      });
      
      console.log('✅ AI request successful!');
      console.log('🤖 Response:', response.data.choices[0].message.content);
      console.log('\n🎉 Demo complete! Check the dashboard: http://localhost:3000/dashboard');
    } else {
      console.log('⚠️  Set OPENAI_KEY in .env to test AI requests');
    }
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('\nTroubleshooting:');
    console.log('1. Make sure server is running: npm run dev');
    console.log('2. Check your .env file has ADMIN_API_KEY set');
    console.log('3. Check logs: docker logs budgetguard-api');
  }
}

runDemo();