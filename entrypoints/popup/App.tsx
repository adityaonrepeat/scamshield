import { useState, useEffect } from 'react';
import { AnalysisResult } from '@/utils/classifier';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Shield, ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

function App() {
  const [status, setStatus] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await browser.runtime.sendMessage({ action: 'getStatusPopup' });
        if (res) {
          setStatus(res);
        }
      } catch (e) {
        console.error("Popup error", e);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  const handleReanalyze = async () => {
    setLoading(true);
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if(tabs.length > 0 && tabs[0].id) {
        try {
            await browser.tabs.sendMessage(tabs[0].id, { action: 'reanalyzePage' });
        } catch(e) { console.warn("Content script might not be ready", e); }
        
        setTimeout(async () => {
            try {
                const res = await browser.runtime.sendMessage({ action: 'getStatusPopup' });
                setStatus(res);
            } catch(e) {}
            setLoading(false);
        }, 1000);
    } else {
        setLoading(false);
    }
  };

  if (loading) {
      return (
          <div className="flex items-center justify-center w-87.5 h-100 bg-background text-foreground">
              <RefreshCw className="animate-spin w-8 h-8 text-primary" />
          </div>
      )
  }

  if (!status) return (
    <div className="flex flex-col items-center justify-center w-87.5 h-100 bg-background p-6 text-center">
      <Shield className="w-16 h-16 text-muted-foreground mb-4" />
      <h2 className="text-xl font-bold mb-2">No Analysis Found</h2>
      <p className="text-muted-foreground">Visit a website to scan it.</p>
    </div>
  );

  const getStatusColor = () => {
      switch(status.mode) {
          case 'green': return 'text-green-500';
          case 'yellow': return 'text-yellow-500';
          case 'red': return 'text-destructive';
          default: return 'text-muted-foreground';
      }
  }

  const getStatusIcon = () => {
      switch(status.mode) {
          case 'green': return <ShieldCheck className="w-16 h-16 text-green-500" />;
          case 'yellow': return <ShieldAlert className="w-16 h-16 text-yellow-500" />;
          case 'red': return <ShieldAlert className="w-16 h-16 text-destructive" />;
          default: return <Shield className="w-16 h-16 text-muted-foreground" />;
      }
  }

  return (
    <div className="w-87.5 min-h-100 bg-background text-foreground p-4">
      <header className="mb-6 text-center">
        <h1 className="text-lg font-bold tracking-tight">ScamShield Protection</h1>
      </header>
      
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col items-center space-y-4 pb-2">
            {getStatusIcon()}
            <CardTitle className={cn("text-2xl", getStatusColor())}>
                {status.mode?.toUpperCase() || "UNKNOWN"}
            </CardTitle>
            <CardDescription className="text-center break-all line-clamp-2 px-4">
                {status.url}
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
             <div className="flex justify-between items-center bg-muted/50 p-3 rounded-md">
                 <span className="text-sm font-medium">Risk Score</span>
                 <span className={cn("font-bold text-lg", getStatusColor())}>{status.score}/100</span>
             </div>
             
            {status.modelUsed && (
                <div className="text-xs font-mono bg-primary/10 text-primary py-1 px-2 rounded inline-block">
                    AI Analysis Active
                </div>
            )}
        </CardContent>
        <CardFooter>
            <Button onClick={handleReanalyze} variant="outline" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-scan Page
            </Button>
        </CardFooter>
      </Card>
      
      <div className="mt-4 text-center text-xs text-muted-foreground">
          Protected by ScamShield
      </div>
    </div>
  );
}

export default App;
