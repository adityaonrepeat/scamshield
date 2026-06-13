import { initModelLoader, analyzeURL, AnalysisResult } from '@/utils/classifier';
import '@/assets/main.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    console.log('ScamShield Content Script Loaded');
    initModelLoader();

    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;

    async function showAlert(analysisData: AnalysisResult) {
      const { mode, score, features, whitelisted, modelUsed, modelPredictionRaw } = analysisData;
      
      if (ui) {
        ui.remove();
        ui = null;
      }

      if (whitelisted || mode === 'green' || mode === 'error') return;

      let details = `Score: ${score}`;
      if(modelUsed) details += ` (ML: ${(modelPredictionRaw * 100).toFixed(0)}%)`;

      ui = await createShadowRootUi(ctx, {
        name: 'scamshield-alert',
        position: 'inline',
        onMount(uiContainer: HTMLElement, shadow: ShadowRoot, shadowHost: any) {
          shadowHost.style.zIndex = '2147483647';
          const wrapper = document.createElement('div');
          
          if (mode === 'red') {
            wrapper.className = "fixed inset-0 w-screen h-screen bg-background/95 backdrop-blur-sm flex justify-center items-center z-[2147483647]";
            wrapper.innerHTML = `
              <div class="bg-card text-card-foreground border border-border p-8 rounded-lg max-w-xl text-center shadow-2xl animate-in fade-in zoom-in duration-300">
                  <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-destructive"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>
                  </div>
                  <h1 class="text-2xl font-bold tracking-tight mb-2 text-foreground">Suspicious Page Detected</h1>
                  <p class="text-muted-foreground mb-6">ScamShield has identified a significant risk on this page.</p>
                  
                  <div class="bg-muted p-4 rounded-md mb-8 font-mono text-sm text-left text-muted-foreground border border-border">
                      <div class="flex justify-between mb-1">
                        <span>Risk Score:</span>
                        <span class="font-bold text-destructive">${score}/100</span>
                      </div>
                      ${modelUsed ? `<div class="flex justify-between mb-1"><span>AI Confidence:</span><span>${(modelPredictionRaw * 100).toFixed(0)}%</span></div>` : ''}
                      <div class="border-t border-border my-2"></div>
                      <div class="truncate">Host: ${features.hostname}</div>
                  </div>
                  
                  <div class="flex flex-col sm:flex-row justify-center gap-4">
                    <button id="ss-back" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full sm:w-auto">
                        Go Back to Safety
                    </button>
                    <button id="ss-proceed" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full sm:w-auto">
                        Proceed (Risky)
                    </button>
                  </div>
              </div>
            `;
            
            uiContainer.append(wrapper);
            
            wrapper.querySelector('#ss-back')?.addEventListener('click', () => window.history.back());
            wrapper.querySelector('#ss-proceed')?.addEventListener('click', () => {
              ui?.remove();
              ui = null;
            });

          } else if (mode === 'yellow') {
             wrapper.className = "fixed top-5 right-5 w-[380px] bg-card text-card-foreground border border-border rounded-lg p-0 shadow-lg z-[2147483647] animate-in slide-in-from-right duration-500";
             wrapper.innerHTML = `
                <div class="p-6">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                            <span class="font-semibold leading-none tracking-tight">Potential Concerns</span>
                        </div>
                        <button id="ss-close" class="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">&times;</button>
                    </div>
                    <div class="text-sm text-muted-foreground mb-4">
                        ${details}
                    </div>
                </div>
                <div class="flex items-center p-6 pt-0 gap-2">
                    <button id="ss-mark-safe" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3">
                        Mark Safe
                    </button>
                    <button id="ss-ignore" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2">
                        Ignore
                    </button>
                </div>
            `;
            uiContainer.append(wrapper);
            
            wrapper.querySelector('#ss-close')?.addEventListener('click', () => {
               ui?.remove();
               ui = null;
            });
            wrapper.querySelector('#ss-ignore')?.addEventListener('click', () => {
               ui?.remove();
               ui = null;
            });
            wrapper.querySelector('#ss-mark-safe')?.addEventListener('click', async () => {
                const res = await browser.storage.local.get('scamShieldWhitelist');
                const whitelist: string[] = (res.scamShieldWhitelist as string[]) || [];
                if(!whitelist.includes(features.hostname)) {
                    whitelist.push(features.hostname);
                    await browser.storage.local.set({ scamShieldWhitelist: whitelist });
                }
                ui?.remove();
                ui = null;
            });
          }
        },
      });
      ui.mount();
    }

    async function runAnalysis() {
        console.log("ScamShield: Running analysis...");
        const result = await analyzeURL(window.location.href, document);
        
        browser.runtime.sendMessage({ action: "cacheAnalysisResult", data: result });
        
        showAlert(result);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runAnalysis);
    } else {
        runAnalysis();
    }

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'reanalyzePage') {
            runAnalysis();
        }
    });

  },
});
