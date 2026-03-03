const loadScript = (src) =>
  new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve(true);

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export const openRazorpayCheckout = async ({
  key,
  orderId,
  amount,
  name = "UniFi",
  description,
  prefill = {},
}) => {
  const ok = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!ok || !window.Razorpay) throw new Error("Razorpay SDK failed to load");

  return new Promise((resolve, reject) => {
    const instance = new window.Razorpay({
      key,
      order_id: orderId,
      amount: amount * 100,
      name,
      description,
      prefill,
      theme: {
        color: "#C9A84C",
      },
      method: {
        upi: true,
      },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error("Payment popup closed")),
      },
    });

    instance.open();
  });
};
