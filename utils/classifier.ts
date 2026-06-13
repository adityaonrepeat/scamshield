import * as tf from '@tensorflow/tfjs';
import { extractAllFeatures, GLOBALLY_TRUSTED_DOMAINS, ExtractedFeatures } from './features';

const MODEL_PATH = browser.runtime.getURL('/model/model.json' as any);

const WHITELIST_KEY = 'scamShieldWhitelist';

let model: tf.GraphModel | tf.LayersModel | null = null;
let initialModelLoadPromise: Promise<tf.GraphModel | tf.LayersModel | null> | null = null;

export async function loadModel(): Promise<tf.GraphModel | tf.LayersModel | null> {
  if (model) return model;

  const loadGraph = async () => {
      try {
        return await tf.loadGraphModel(MODEL_PATH, { strict: false });
      } catch(e) { return null; }
  };

  const loadLayers = async () => {
      try {
        return await tf.loadLayersModel(MODEL_PATH);
      } catch(e) { return null; }
  };

  try {
    model = await loadGraph();
    if (!model) {
        model = await loadLayers();
    }
    
    if (!model) {
        throw new Error("Could not load model as Graph OR Layers model.");
    }

    console.log('MODEL_LOADER: Model loaded successfully.');

    tf.tidy(() => {
        if(!model) return;
        const warmupInput = tf.zeros([1, 16]);
        try {
             model.predict(warmupInput);
        } catch (e) {
            console.error('Warmup failed', e);
        }
    });

    return model;
  } catch (e) {
    console.error('MODEL_LOADER: Failed to load model', e);
    return null;
  }
}

export function initModelLoader() {
    initialModelLoadPromise = loadModel();
}

export interface AnalysisResult {
  score: number;
  mode: 'red' | 'yellow' | 'green' | 'error' | 'N/A';
  features: ExtractedFeatures['heuristicFeatures'];
  whitelisted: boolean;
  url: string;
  modelUsed: boolean;
  heuristicScoreCalculated: number;
  modelPredictionRaw: number;
}

export async function analyzeURL(url: string, dom: Document): Promise<AnalysisResult> {
  await initialModelLoadPromise;

  const extractedData = extractAllFeatures(url, dom);
  const { heuristicFeatures, scaledMlFeatures } = extractedData;
  const hostname = heuristicFeatures.hostname;

  const storage = await browser.storage.local.get([WHITELIST_KEY]);
  const whitelist = (storage[WHITELIST_KEY] as string[]) || [];

  if (whitelist.includes(hostname)) {
      return createResult(0, 'green', heuristicFeatures, true, url, false, 0, 0);
  }

  for (const trusted of GLOBALLY_TRUSTED_DOMAINS) {
    if (hostname === trusted || hostname.endsWith('.' + trusted)) {
        if (!heuristicFeatures.hasHomograph) {
            return createResult(0, 'green', heuristicFeatures, true, url, false, 0, 0);
        }
    }
  }

  let heuristicScore = 0;
  if (heuristicFeatures.length > 50 && !url.includes('/chat/') && !url.includes('/session/')) {
       heuristicScore += 20;
  }
  if ((url.match(/-/g) || []).length > 5) {
      heuristicScore += 20;
  }
  if (heuristicFeatures.isHTTP) heuristicScore += 40;
  if (heuristicFeatures.hasForms) heuristicScore += 30;
  if (heuristicFeatures.isEdu) heuristicScore = Math.max(0, heuristicScore - 20);
  if (heuristicFeatures.hasHomograph) heuristicScore += 60;
  
  heuristicScore = Math.max(0, Math.min(150, heuristicScore));

  let modelScoreRaw = 0;
  let modelPredictionSuccessful = false;

  if (model && scaledMlFeatures && scaledMlFeatures.length === 16) {
      try {
          const tensor = tf.tensor2d([scaledMlFeatures], [1, 16]);
          
          let outputTensor: tf.Tensor;
          if (model instanceof tf.GraphModel) {
             const result = model.execute(tensor) as tf.Tensor|tf.Tensor[];
             if(Array.isArray(result)) outputTensor = result[0];
             else outputTensor = result;
          } else {
             outputTensor = model.predict(tensor) as tf.Tensor;
          }

          const data = await outputTensor.data();
          modelScoreRaw = data[0];
          modelPredictionSuccessful = true;
          
          tensor.dispose();
          outputTensor.dispose();

      } catch (e) {
          console.error("TFJS Prediction Error", e);
      }
  }

  const hNorm = Math.min(100, heuristicScore);
  let finalScore = hNorm;
  if (modelPredictionSuccessful) {
      const mlScoreScaled = modelScoreRaw * 100;
      finalScore = (hNorm * 0.3) + (mlScoreScaled * 0.7);
      if (mlScoreScaled >= 90) finalScore = Math.max(finalScore, mlScoreScaled);
      if (hNorm >= 70) finalScore = Math.max(finalScore, hNorm);
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  const mode = finalScore > 70 ? 'red' : finalScore >= 30 ? 'yellow' : 'green';

  return createResult(finalScore, mode, heuristicFeatures, false, url, modelPredictionSuccessful, heuristicScore, modelScoreRaw);
}

function createResult(score: number, mode: any, features: any, whitelisted: boolean, url: string, modelUsed: boolean, hScore: number, mScore: number): AnalysisResult {
    return {
        score,
        mode,
        features,
        whitelisted,
        url,
        modelUsed,
        heuristicScoreCalculated: hScore,
        modelPredictionRaw: mScore
    };
}
