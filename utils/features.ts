
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

export const GLOBALLY_TRUSTED_DOMAINS = [
  'google.com',
  'bing.com',
  'duckduckgo.com',
  'yahoo.com',
  'github.com',
  'microsoft.com',
  'apple.com',
  'amazon.com',
  'wikipedia.org',
  'mozilla.org',
];

export interface HeuristicFeatures {
  isHTTP: boolean;
  length: number;
  hasForms: boolean;
  isEdu: boolean;
  hostname: string;
  hasHomograph: boolean;
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
      url.length,
      hostname.length,
      path.length,
      query.length,
      (url.match(/\./g) || []).length,
      (url.match(/-/g) || []).length,
      (url.match(/@/g) || []).length,
      (url.match(/\?/g) || []).length,
      (url.match(/=/g) || []).length,
      (url.match(/_/g) || []).length,
      (url.match(/%/g) || []).length,
      (url.match(/\//g) || []).length,
      url.toLowerCase().startsWith('https') ? 1 : 0,
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ? 1 : 0,
      (url.match(/\d/g) || []).length,
      (url.match(/[a-zA-Z]/g) || []).length,
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
        return Math.max(0, Math.min(1, scaled_value));
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
