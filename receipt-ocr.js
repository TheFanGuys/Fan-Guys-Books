/* The OCR engine and English model are served with Books. Receipt pixels stay in the worker. */
(function () {
  'use strict';
  var base = new URL('ocr/', document.currentScript.src);
  var enginePromise;

  function loadEngine() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!enginePromise) {
      enginePromise = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = new URL('tesseract.min.js', base).href;
        script.onload = function () { resolve(window.Tesseract); };
        script.onerror = function () { script.remove(); reject(new Error('OCR script unavailable')); };
        document.head.appendChild(script);
      }).catch(function (error) { enginePromise = null; throw error; });
    }
    return enginePromise;
  }

  async function read(image, report) {
    var worker, timer, expired = false;
    var scan = async function () {
      var engine = await loadEngine();
      if (expired) return '';
      worker = await engine.createWorker('eng', 1, {
        workerPath: new URL('worker.min.js', base).href,
        corePath: new URL('tesseract-core-lstm.wasm.js', base).href,
        langPath: base.href.replace(/\/$/, ''),
        workerBlobURL: false,
        logger: function (event) {
          if (!expired && event.status === 'recognizing text') {
            report('Reading receipt on this device… ' + Math.round(event.progress * 100) + '%');
          }
        }
      });
      if (expired) { await worker.terminate(); return ''; }
      var result = await worker.recognize(image);
      return result.data.text;
    };
    try {
      return await Promise.race([scan(), new Promise(function (_, reject) {
        timer = setTimeout(function () { reject(new Error('Receipt scan timed out')); }, 30000);
      })]);
    } finally {
      clearTimeout(timer);
      expired = true;
      if (worker) await worker.terminate().catch(function () {});
    }
  }

  window.FGBReceiptOCR = { read: read };
})();
