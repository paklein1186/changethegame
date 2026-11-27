import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Check, Play, Loader2, Globe, Code, Zap, Shield } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-muted/50 p-4 overflow-x-auto text-xs leading-relaxed font-mono text-foreground">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-card border border-border opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      <Badge variant="outline" className="absolute bottom-2 right-2 text-[10px]">{language}</Badge>
    </div>
  );
}

const REQUEST_EXAMPLE = `{
  "messages": [
    { "role": "user", "content": "Help me plan our sprint" },
    { "role": "assistant", "content": "I'd be happy to help..." },
    { "role": "user", "content": "Focus on the backlog first" }
  ],
  "context": {
    "unit_type": "guild",
    "unit_id": "a1b2c3d4-...",
    "unit_context": "Guild: Design Team — 12 members, focus: UI/UX",
    "agent_id": "e5f6g7h8-...",
    "user_id": "i9j0k1l2-..."
  }
}`;

const RESPONSE_JSON = `// Option A — JSON response
{
  "content": "Here's a sprint plan based on your backlog..."
}`;

const RESPONSE_SSE = `// Option B — SSE stream (set Content-Type: text/event-stream)
data: {"choices":[{"delta":{"content":"Here's"}}]}

data: {"choices":[{"delta":{"content":" a sprint"}}]}

data: {"choices":[{"delta":{"content":" plan..."}}]}

data: [DONE]`;

const PYTHON_EXAMPLE = `from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/agent", methods=["POST"])
def agent():
    data = request.json
    messages = data.get("messages", [])
    context = data.get("context", {})
    
    # Verify webhook secret (optional)
    secret = request.headers.get("X-Webhook-Secret")
    if secret != "your-secret-here":
        return jsonify({"error": "Unauthorized"}), 401
    
    # Get the latest user message
    user_msg = messages[-1]["content"] if messages else ""
    unit_type = context.get("unit_type")
    
    # Your logic here...
    reply = f"Received: {user_msg}"
    if unit_type:
        reply += f" (context: {unit_type})"
    
    return jsonify({"content": reply})

if __name__ == "__main__":
    app.run(port=3000)`;

const NODE_EXAMPLE = `const express = require("express");
const app = express();
app.use(express.json());

app.post("/agent", (req, res) => {
  const { messages, context } = req.body;
  
  // Verify webhook secret (optional)
  const secret = req.headers["x-webhook-secret"];
  if (secret !== "your-secret-here") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // Get the latest user message
  const userMsg = messages[messages.length - 1]?.content || "";
  const unitType = context?.unit_type;
  
  // Your logic here...
  let reply = \`Received: \${userMsg}\`;
  if (unitType) reply += \` (context: \${unitType})\`;
  
  // Option A: JSON response
  res.json({ content: reply });
  
  // Option B: SSE stream (uncomment to use)
  // res.setHeader("Content-Type", "text/event-stream");
  // res.write(\`data: {"choices":[{"delta":{"content":"\${reply}"}}]}\\n\\n\`);
  // res.write("data: [DONE]\\n\\n");
  // res.end();
});

app.listen(3000, () => console.log("Agent running on :3000"));`;

const N8N_EXAMPLE = `// n8n Webhook Node Configuration:
// 1. Add a "Webhook" node as trigger
//    - HTTP Method: POST
//    - Path: /agent
//
// 2. Add a "Code" node after it:

const messages = $input.first().json.body.messages;
const context = $input.first().json.body.context;

const userMsg = messages[messages.length - 1]?.content || "";
const unitType = context?.unit_type || "direct";

// Process with your workflow logic...
const reply = \`Processed: \${userMsg} (from \${unitType})\`;

// 3. Add a "Respond to Webhook" node:
//    - Response Body: { "content": "{{$json.reply}}" }

return { reply };`;

export default function WebhookSpecPage() {
  const { t } = useTranslation();
  const [testUrl, setTestUrl] = useState("");
  const [testSecret, setTestSecret] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const runTest = async () => {
    if (!testUrl.trim()) { toast.error(t("uiWebhookSpecPage.enterAWebhookUrl")); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (testSecret.trim()) headers["X-Webhook-Secret"] = testSecret.trim();

      const resp = await fetch(testUrl.trim(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello! This is a test message from the webhook spec page." }],
          context: {
            unit_type: null,
            unit_id: null,
            unit_context: "Test from webhook spec page",
            agent_id: "test-000-000",
            user_id: "test-000-000",
          },
        }),
      });

      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const text = await resp.text();
        setTestResult(`✅ SSE stream received (${resp.status}):\n\n${text.slice(0, 500)}`);
      } else {
        const json = await resp.json();
        setTestResult(`✅ JSON response (${resp.status}):\n\n${JSON.stringify(json, null, 2)}`);
      }
    } catch (e: any) {
      setTestResult(`❌ Error: ${e.message}\n\nMake sure your server is running and allows CORS from this domain.`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/agents"><ArrowLeft className="h-4 w-4 mr-1" /> {t("uiWebhookSpecPage.backToAgents")}</Link>
        </Button>

        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-2">
            <Globe className="h-7 w-7 text-primary" /> {t("uiWebhookSpecPage.webhookAgentSpecification")}
          </h1>
          <p className="text-muted-foreground">
            {t("uiWebhookSpecPage.buildYourOwnAgentBackendYour")}
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <Card className="p-4 text-center">
            <Code className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">{t("uiWebhookSpecPage.anyLanguage")}</p>
            <p className="text-xs text-muted-foreground">{t("uiWebhookSpecPage.pythonNodeGoN8n")}</p>
          </Card>
          <Card className="p-4 text-center">
            <Zap className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">{t("uiWebhookSpecPage.jsonOrSse")}</p>
            <p className="text-xs text-muted-foreground">{t("uiWebhookSpecPage.simpleResponseOrStream")}</p>
          </Card>
          <Card className="p-4 text-center">
            <Shield className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">{t("uiWebhookSpecPage.secretVerification")}</p>
            <p className="text-xs text-muted-foreground">{t("uiWebhookSpecPage.optionalXWebhookSecret")}</p>
          </Card>
        </div>

        {/* Request Format */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-1">{t("uiWebhookSpecPage.requestFormat")}</h2>
          <p className="text-sm text-muted-foreground mb-3">
            {t("uiWebhookSpecPage.yourWebhookReceivesA")} <Badge variant="outline" className="text-[10px] mx-0.5">POST</Badge> {t("uiWebhookSpecPage.requestWithTheFollowingJsonBody")}
          </p>
          <CodeBlock code={REQUEST_EXAMPLE} language="JSON" />

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
            <p className="font-semibold text-foreground">{t("uiWebhookSpecPage.headersSentWithEveryRequest")}</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li><code className="bg-muted px-1 py-0.5 rounded text-foreground">{t("uiWebhookSpecPage.contentTypeApplicationJson")}</code></li>
              <li><code className="bg-muted px-1 py-0.5 rounded text-foreground">{t("uiWebhookSpecPage.xWebhookSecretYourSecret")}</code> {t("uiWebhookSpecPage.onlyIfYouConfiguredAWebhook")}</li>
            </ul>
          </div>
        </section>

        {/* Context Fields */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">{t("uiWebhookSpecPage.contextFields")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left p-3 font-medium">{t("uiWebhookSpecPage.field")}</th>
                  <th className="text-left p-3 font-medium">{t("uiWebhookSpecPage.type")}</th>
                  <th className="text-left p-3 font-medium">{t("uiWebhookSpecPage.description")}</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  ["unit_type", '"guild" | "quest" | "pod" | null', "The type of entity the agent is chatting within, or null for direct hire"],
                  ["unit_id", "uuid | null", "ID of the guild/quest/pod, or null"],
                  ["unit_context", "string", "Human-readable description of the unit (name, size, focus)"],
                  ["agent_id", "uuid", "The agent's unique ID on the platform"],
                  ["user_id", "uuid", "The ID of the user chatting with the agent"],
                ].map(([field, type, desc]) => (
                  <tr key={field} className="border-t border-border/50">
                    <td className="p-3 font-mono text-foreground">{field}</td>
                    <td className="p-3 text-muted-foreground">{type}</td>
                    <td className="p-3 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Response Format */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-1">{t("uiWebhookSpecPage.responseFormat")}</h2>
          <p className="text-sm text-muted-foreground mb-3">{t("uiWebhookSpecPage.chooseOneOfTwoResponseFormats")}</p>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{t("uiWebhookSpecPage.optionA")}</Badge> {t("uiWebhookSpecPage.jsonResponse")}
              </h3>
              <CodeBlock code={RESPONSE_JSON} language="JSON" />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{t("uiWebhookSpecPage.optionB")}</Badge> {t("uiWebhookSpecPage.serverSentEventsSse")}
              </h3>
              <CodeBlock code={RESPONSE_SSE} language="SSE" />
              <p className="text-xs text-muted-foreground mt-2">
                {t("uiWebhookSpecPage.set")} <code className="bg-muted px-1 py-0.5 rounded text-foreground">{t("uiWebhookSpecPage.contentTypeTextEventStream")}</code> {t("uiWebhookSpecPage.toEnableStreamingTheFormatFollows")}
              </p>
            </div>
          </div>
        </section>

        {/* Code Examples */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">{t("uiWebhookSpecPage.codeExamples")}</h2>
          <Tabs defaultValue="python">
            <TabsList className="mb-3">
              <TabsTrigger value="python">{t("uiWebhookSpecPage.pythonFlask")}</TabsTrigger>
              <TabsTrigger value="node">{t("uiWebhookSpecPage.nodeJsExpress")}</TabsTrigger>
              <TabsTrigger value="n8n">⚡ n8n</TabsTrigger>
            </TabsList>
            <TabsContent value="python">
              <CodeBlock code={PYTHON_EXAMPLE} language="Python" />
            </TabsContent>
            <TabsContent value="node">
              <CodeBlock code={NODE_EXAMPLE} language="JavaScript" />
            </TabsContent>
            <TabsContent value="n8n">
              <CodeBlock code={N8N_EXAMPLE} language="JavaScript" />
            </TabsContent>
          </Tabs>
        </section>

        {/* Test Section */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" /> {t("uiWebhookSpecPage.testYourWebhook")}
          </h2>
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("uiWebhookSpecPage.webhookUrl")}</label>
              <Input
                value={testUrl}
                onChange={e => setTestUrl(e.target.value)}
                placeholder="https://your-server.com/agent"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("uiWebhookSpecPage.webhookSecretOptional")}</label>
              <Input
                value={testSecret}
                onChange={e => setTestSecret(e.target.value)}
                placeholder="your-secret"
              />
            </div>
            <Button onClick={runTest} disabled={testing} size="sm">
              {testing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t("uiWebhookSpecPage.testing")}</> : <><Play className="h-4 w-4 mr-1" /> {t("uiWebhookSpecPage.sendTestMessage")}</>}
            </Button>
            {testResult && (
              <pre className="rounded-lg border border-border bg-muted/50 p-4 text-xs whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {testResult}
              </pre>
            )}
          </Card>
        </section>

        {/* Error Handling */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">{t("uiWebhookSpecPage.errorHandling")}</h2>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
            <p className="text-muted-foreground">{t("uiWebhookSpecPage.ifYourWebhookReturnsANon")}</p>
            <CodeBlock code={`{ "error": "Something went wrong" }`} language="JSON" />
            <ul className="text-xs text-muted-foreground space-y-1 mt-3">
              <li><strong>401/403</strong> {t("uiWebhookSpecPage.authenticationFailedBadSecret")}</li>
              <li><strong>429</strong> {t("uiWebhookSpecPage.rateLimited")}</li>
              <li><strong>500</strong> {t("uiWebhookSpecPage.internalError")}</li>
              <li><strong>{t("uiWebhookSpecPage.timeout")}</strong> {t("uiWebhookSpecPage.requestsTimeOutAfter30Seconds")}</li>
            </ul>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
