export const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

let recaptchaScriptPromise = null;

export function preloadRecaptcha() {
  return loadRecaptchaScript();
}

function loadRecaptchaScript() {
  if (!recaptchaSiteKey) {
    return Promise.reject(new Error("reCAPTCHA site key is not configured."));
  }
  if (window.grecaptcha?.execute) {
    return Promise.resolve(window.grecaptcha);
  }
  if (recaptchaScriptPromise) {
    return recaptchaScriptPromise;
  }

  recaptchaScriptPromise = new Promise((resolve, reject) => {
    const expectedSrc = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(recaptchaSiteKey);
    let script = document.querySelector("script[data-recaptcha-script=\"true\"]");
    if (script && script.src !== expectedSrc) {
      script.remove();
      script = null;
    }
    const handleLoad = () => {
      window.grecaptcha.ready(() => resolve(window.grecaptcha));
    };
    const handleError = () => reject(new Error("Could not load reCAPTCHA."));

    if (!script) {
      script = document.createElement("script");
      script.src = expectedSrc;
      script.async = true;
      script.defer = true;
      script.dataset.recaptchaScript = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });

  return recaptchaScriptPromise;
}

export async function createRecaptchaToken(action) {
  const grecaptcha = await loadRecaptchaScript();
  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(recaptchaSiteKey, { action }).then(resolve).catch(reject);
    });
  });
}
