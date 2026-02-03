#!/usr/bin/env node

/**
 * Script de teste LOCAL (sem usar Vercel)
 * Execute: node test-payment-local.js
 * 
 * Antes, configure as variáveis:
 * $env:SEALPAY_API_KEY = "seu_token_api"
 */

// Importar o módulo de pagamento diretamente
const paymentModule = require('./api/payment.js');

const testData = {
  cpf: "07317831905",
  nome: "JUAN PABLO MARCONI",
  email: "sashidoblack@gmail.com",
  phone: "(44) 92802-8281",
  amount: "37.73",
  title: "Taxa de Adesão",
};

// Mock de request e response
const req = {
  method: "POST",
  body: testData,
};

const res = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    console.log(`\n✓ Status: ${this.statusCode}\n`);
    console.log("📊 Resposta:");
    console.log(JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log("\n✅ SUCESSO!\n");
      console.log("✨ Dados para gerar QR Code:");
      console.log(`   Transaction ID: ${data.transaction_id}`);
      console.log(`   PIX Code: ${data.pix_code}`);
      console.log(`   Valor: R$ ${(data.amount / 100).toFixed(2)}`);
      console.log(`   Status: ${data.status}`);
    } else {
      console.log("\n❌ ERRO\n");
    }
    return this;
  },
  send: function(msg) {
    console.log("Erro:", msg);
  }
};

async function test() {
  console.log("🧪 Teste LOCAL da API de pagamento\n");
  console.log("📝 Payload:");
  console.log(JSON.stringify(testData, null, 2));
  console.log("\n---\n");
  console.log("⏳ Processando...");
  
  if (!process.env.SEALPAY_API_KEY) {
    console.error("\n❌ ERRO: Variáveis de ambiente não configuradas!");
    console.error("\nConfigure com:");
    console.error('  $env:SEALPAY_API_KEY = "seu_token_api"');
    return;
  }

  await paymentModule(req, res);
}

test();
