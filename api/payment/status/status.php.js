const SEALPAY_STATUS_URL = process.env.SEALPAY_STATUS_URL || "";

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    if (!SEALPAY_STATUS_URL) {
      return res.status(500).json({ success: false, message: "SEALPAY_STATUS_URL não configurada" });
    }

    const id = String(req.query.id || req.query.transaction_id || "").trim();
    if (!id) return res.status(400).json({ success: false, message: "id é obrigatório" });

    const url = SEALPAY_STATUS_URL.includes("{id}")
      ? SEALPAY_STATUS_URL.replace("{id}", encodeURIComponent(id))
      : `${SEALPAY_STATUS_URL}${SEALPAY_STATUS_URL.includes("?") ? "&" : "?"}id=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const txData = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
      const status = txData?.status || data?.status || data?.payment_status || "PENDING";
      return res.json({ success: true, status, transaction: txData || data });
    }

    return res.status(502).json({
      success: false,
      message: "Não foi possível consultar status",
      response: { status: response.status, data },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Erro interno", error: String(e?.message || e) });
  }
};
