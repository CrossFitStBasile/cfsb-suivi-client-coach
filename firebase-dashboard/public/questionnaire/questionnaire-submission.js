(function attachQuestionnaireSubmission(root) {
  "use strict";

  const DEFAULT_RECEIPT_DELAYS_MS = [0, 600, 1400, 2600];
  let callbackSequence = 0;

  function sleep(milliseconds) {
    return new Promise((resolve) => root.setTimeout(resolve, milliseconds));
  }

  function trustedEndpointUrl(endpointUrl) {
    let parsed;
    try {
      parsed = new URL(String(endpointUrl || ""));
    } catch (error) {
      throw new Error("questionnaire_endpoint_invalid");
    }

    const isAppsScriptDeployment = (
      parsed.protocol === "https:"
      && parsed.hostname === "script.google.com"
      && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname)
    );
    if (!isAppsScriptDeployment) {
      throw new Error("questionnaire_endpoint_untrusted");
    }
    return parsed;
  }

  function receiptRequest(endpointUrl, responseId, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!root.document || !root.document.head) {
        reject(new Error("questionnaire_receipt_document_unavailable"));
        return;
      }

      const url = trustedEndpointUrl(endpointUrl);
      const callbackName = `__cfsbQuestionnaireReceipt_${Date.now()}_${callbackSequence += 1}`;
      url.searchParams.set("action", "questionnaire_receipt");
      url.searchParams.set("response_id", responseId);
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("_", String(Date.now()));

      const script = root.document.createElement("script");
      let settled = false;
      let timer = null;

      function cleanup() {
        if (timer) root.clearTimeout(timer);
        try {
          delete root[callbackName];
        } catch (error) {
          root[callbackName] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      function finish(error, value) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      }

      root[callbackName] = (receipt) => finish(null, receipt);
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.onerror = () => finish(new Error("questionnaire_receipt_network_error"));
      script.src = url.toString();
      timer = root.setTimeout(
        () => finish(new Error("questionnaire_receipt_timeout")),
        Math.max(1000, Number(timeoutMs) || 7000)
      );
      root.document.head.appendChild(script);
    });
  }

  async function confirmStored(options) {
    const endpointUrl = options && options.endpointUrl;
    const responseId = String(options && options.responseId || "").trim();
    const delaysMs = Array.isArray(options && options.delaysMs)
      ? options.delaysMs
      : DEFAULT_RECEIPT_DELAYS_MS;
    const request = options && options.receiptRequest
      ? options.receiptRequest
      : receiptRequest;
    const timeoutMs = options && options.timeoutMs;

    trustedEndpointUrl(endpointUrl);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(responseId)) {
      throw new Error("questionnaire_response_id_invalid");
    }

    let lastError = null;
    for (const delayMs of delaysMs) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        const receipt = await request(endpointUrl, responseId, timeoutMs);
        if (
          receipt
          && receipt.ok === true
          && receipt.stored === true
          && String(receipt.response_id || "") === responseId
        ) {
          return receipt;
        }
        lastError = new Error("questionnaire_receipt_not_stored");
      } catch (error) {
        lastError = error;
      }
    }

    const unconfirmed = new Error("questionnaire_submission_unconfirmed");
    unconfirmed.cause = lastError;
    throw unconfirmed;
  }

  async function submit(options) {
    const endpointUrl = options && options.endpointUrl;
    const payload = options && options.payload;
    const fetchImpl = options && options.fetchImpl
      ? options.fetchImpl
      : root.fetch && root.fetch.bind(root);

    trustedEndpointUrl(endpointUrl);
    if (!payload || typeof payload !== "object") {
      throw new Error("questionnaire_payload_invalid");
    }
    if (!fetchImpl) {
      throw new Error("questionnaire_fetch_unavailable");
    }

    await fetchImpl(endpointUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });

    return confirmStored({
      endpointUrl,
      responseId: payload.response_id,
      delaysMs: options && options.receiptDelaysMs,
      timeoutMs: options && options.receiptTimeoutMs,
      receiptRequest: options && options.receiptRequest
    });
  }

  const api = Object.freeze({
    confirmStored,
    submit
  });

  root.CFSBQuestionnaireSubmission = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
