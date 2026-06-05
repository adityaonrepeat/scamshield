// Scaler parameters from original project
// export const SCALER_MIN_ARRAY = [
//   -0.00524476, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.00212879,
// ];

// export const SCALER_SCALE_ARRAY = [
//   4.37062937e-4, 3.98406375e-3, 9.58772771e-4, 4.48430493e-4, 1.72413793e-2,
//   1.69491525e-2, 2.27272727e-2, 8.06451613e-3, 1.26582278e-2, 1.13636364e-2,
//   3.95256917e-3, 1.07526882e-2, 1.0, 1.0, 1.86567164e-3, 5.32197978e-4,
// ];


export const SCALER_MIN_ARRAY = [
  11.0, 3.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
  0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 4.0
];

export const SCALER_SCALE_ARRAY = [
  6093.0, 248.0, 2156.0, 6036.0,
  58.0, 65.0, 44.0, 247.0,
  80.0, 89.0, 680.0, 243.0,
  1.0, 1.0, 1176.0, 5289.0
];

export const GLOBALLY_TRUSTED_DOMAINS = ['bing.com'];

export interface HeuristicFeatures {
  isHTTP: boolean;
  length: number;
  hasForms: boolean;
  isEdu: boolean;
  hostname: string;
  hasHomograph: boolean;
  p2pFlag?: 'p2p_phishing' | 'p2p_safe' | null;
}

export interface ExtractedFeatures {
  heuristicFeatures: HeuristicFeatures;
  scaledMlFeatures: number[] | null;
}

function isPotentialHomograph(hostname: string): boolean {
  if (!hostname) return false;
  const labels = hostname.split('.');
  for (const label of labels) {
    if (label.startsWith('xn--')) {
      return true;
    }
  }
  const latinRegex = /[a-zA-Z]/;
  const cyrillicRegex = /[\u0400-\u04FF]/;
  if (latinRegex.test(hostname) && cyrillicRegex.test(hostname)) {
    return true;
  }
  const confusables: Record<string, string> = {
    а: 'a',
    е: 'e',
    о: 'o',
    р: 'p',
    с: 'c',
    х: 'x',
    і: 'i',
  };
  for (const char of hostname) {
    if (confusables[char]) {
      return true;
    }
  }
  return false;
}

export function extractAllFeatures(url: string, dom: Document): ExtractedFeatures {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname || '';
    const path = parsedUrl.pathname || '';
    const query = parsedUrl.search || '';

    const heuristicFeatures: HeuristicFeatures = {
      isHTTP: url.startsWith('http:'),
      length: url.length,
      hasForms: dom.querySelector('form input[type="password"]') !== null,
      isEdu: hostname.endsWith('.edu'),
      hostname: hostname,
      hasHomograph: isPotentialHomograph(hostname),
    };

    const rawMlFeatures = [
      url.length, // 1. length
      hostname.length, // 2. hostname_length
      path.length, // 3. path_length
      query.length, // 4. query_length
      (url.match(/\./g) || []).length, // 5. num_dots
      (url.match(/-/g) || []).length, // 6. num_hyphens
      (url.match(/@/g) || []).length, // 7. num_at
      (url.match(/\?/g) || []).length, // 8. num_question_marks
      (url.match(/=/g) || []).length, // 9. num_equals
      (url.match(/_/g) || []).length, // 10. num_underscore
      (url.match(/%/g) || []).length, // 11. num_percent
      (url.match(/\//g) || []).length, // 12. num_slash
      url.toLowerCase().startsWith('https') ? 1 : 0, // 13. has_https
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ? 1 : 0, // 14. has_ip
      (url.match(/\d/g) || []).length, // 15. num_digits
      (url.match(/[a-zA-Z]/g) || []).length, // 16. num_letters
    ];

    if (rawMlFeatures.length !== 16) {
      console.error(
        `FEATURE_EXTRACTION: Extracted ${rawMlFeatures.length} ML features, expected 16.`
      );
      return { heuristicFeatures, scaledMlFeatures: null };
    }

    const scaledMlFeatures = rawMlFeatures.map((value, index) => {
      if (
        SCALER_MIN_ARRAY &&
        SCALER_SCALE_ARRAY &&
        index < SCALER_MIN_ARRAY.length
      ) {
        const scaled_value =
          (value - SCALER_MIN_ARRAY[index]) / SCALER_SCALE_ARRAY[index];
        return Math.max(0, Math.min(1, scaled_value)); // Clip 0-1
      }
      return value;
    });

    return { heuristicFeatures, scaledMlFeatures };
  } catch (e) {
    console.error('!!! ERROR in extractAllFeatures:', e);
    let hn = '';
    try {
      hn = new URL(url).hostname || '';
    } catch (_) {}
    return {
      heuristicFeatures: {
        hostname: hn,
        isHTTP: url.startsWith('http:'),
        hasHomograph: false,
        length: url.length,
        hasForms: false,
        isEdu: false,
      },
      scaledMlFeatures: null,
    };
  }
}
