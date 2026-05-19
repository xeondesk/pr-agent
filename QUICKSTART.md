# 🚀 PR-Agent Web Platform - Quick Start

## 60 Seconds to Running

### Step 1: Install Dependencies (30 seconds)
```bash
pnpm install
```

### Step 2: Set Up Environment (10 seconds)
```bash
cd apps/web
cp .env.example .env.local
```

Edit `.env.local` and add your OpenAI API key:
```
OPENAI_API_KEY=sk-your-api-key-here
```

### Step 3: Start Development Server (10 seconds)
```bash
pnpm dev
```

### Step 4: Open in Browser (10 seconds)
Visit: **http://localhost:3000**

---

## 🎯 Try It Out

### Option A: Analyze a GitHub PR
1. Copy a GitHub PR URL: `https://github.com/owner/repo/pull/123`
2. Paste in the PR input field
3. Click "Analyze"
4. Watch real-time analysis appear

### Option B: Analyze a Diff
1. Copy any git diff
2. Click in the input field (it expands)
3. Paste the diff
4. Click "Analyze"

### Select Analysis Type
- **Review**: Full code analysis with feedback
- **Describe**: Summary of changes
- **Improve**: Suggestions for improvement
- **Ask**: Custom questions about the PR

---

## 📊 What It Does

The app uses GPT-4 to analyze pull requests and provide:
- Code quality feedback
- Security issue detection
- Best practices suggestions
- Change summaries
- Custom analysis

All responses stream in real-time as the AI generates them.

---

## 🏗️ Project Structure

```
pr-agent-web/
├── apps/web/                    # Main web application
│   ├── app/api/                 # API routes (streaming)
│   ├── app/components/          # React components
│   ├── lib/prAgent.ts           # Core library
│   └── README.md                # Detailed guide
├── packages/                    # Reusable modules
│   ├── types/                   # TypeScript types
│   ├── core/                    # AI handlers & utilities
│   ├── tools/                   # Analysis tools
│   └── agents/                  # Agent orchestration
└── IMPLEMENTATION.md            # Full documentation
```

---

## 🔧 Available Commands

### From Root
```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm type-check  # Check TypeScript types
```

### From apps/web
```bash
pnpm dev          # Development
pnpm build        # Production build
pnpm start        # Run production build
pnpm type-check  # Type checking
```

---

## 🌐 API Routes

The app provides SSE streaming API endpoints:

### POST /api/review
Comprehensive PR analysis
```bash
curl -X POST http://localhost:3000/api/review \
  -H "Content-Type: application/json" \
  -d '{"prUrl": "https://github.com/owner/repo/pull/123"}'
```

### POST /api/describe
Change summary
```bash
curl -X POST http://localhost:3000/api/describe \
  -H "Content-Type: application/json" \
  -d '{"diff": "..."}'
```

### POST /api/improve
Improvement suggestions
```bash
curl -X POST http://localhost:3000/api/improve \
  -H "Content-Type: application/json" \
  -d '{"prUrl": "...", "userQuery": "focus area"}'
```

### POST /api/ask
Custom questions
```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"prUrl": "...", "userQuery": "your question"}'
```

---

## 📋 Features

✅ Real-time streaming responses  
✅ GitHub PR integration  
✅ Raw diff support  
✅ Multiple analysis tools  
✅ Token counting  
✅ Error handling  
✅ Loading states  
✅ Dark mode UI  

---

## 🛠️ Architecture

**Frontend**: React 19 + TypeScript  
**Framework**: Next.js 15  
**AI**: OpenAI GPT-4 with streaming  
**Styling**: Tailwind CSS  
**Type Safety**: 100% TypeScript (strict)  

---

## 📦 Technologies

- **Next.js 15.5+** - React framework
- **React 19** - UI library  
- **TypeScript 5.3+** - Type safety
- **Tailwind CSS** - Styling
- **OpenAI API** - GPT-4 analysis
- **js-tiktoken** - Token counting
- **pnpm** - Package management

---

## 🔑 Environment Variables

Required:
```
OPENAI_API_KEY=sk-your-key-here
```

Optional:
```
# GitHub (auto-detected if you have access)
# No configuration needed
```

---

## 🚨 Troubleshooting

### Dev server won't start
```bash
# Clear cache and reinstall
rm -rf node_modules .next
pnpm install
pnpm dev
```

### Missing environment variable
```bash
cd apps/web
# Copy example and edit with your API key
cp .env.example .env.local
```

### OpenAI API error
- Verify your API key is correct
- Check you have quota/credits
- Ensure it's a GPT-4 enabled key

### Type checking errors
```bash
pnpm type-check
# Review TypeScript errors in output
```

---

## 📚 Learn More

- **Full Implementation Guide**: See `IMPLEMENTATION.md`
- **Verification Report**: See `VERIFICATION.md`
- **Web App README**: See `apps/web/README.md`

---

## 🎓 Key Concepts

### Streaming Responses
The app uses Server-Sent Events (SSE) for real-time text streaming from GPT-4. This creates a chat-like experience where you see the response as it's being generated.

### Tool Registry
Tools are registered in the agent system, making it easy to add new analysis types without modifying core code.

### Monorepo Structure
Packages are organized by responsibility (types, core, tools, agents) making code reusable and testable.

### TypeScript Strict Mode
100% type-safe code with strict null checks, proper async handling, and no `any` types.

---

## 🚀 Next Steps

1. **Run it**: `pnpm install && pnpm dev`
2. **Try it**: Analyze a PR at http://localhost:3000
3. **Extend it**: Add new tools by extending BaseTool
4. **Deploy it**: Push to Vercel (OPENAI_API_KEY env var needed)
5. **Customize**: Modify prompts in tool classes

---

## 💡 Tips

- Use `Review` for full analysis
- Use `Describe` for summaries
- Use `Improve` for specific feedback
- Use `Ask` for custom questions
- Large diffs are auto-compressed for efficiency
- Streaming responses support real-time display

---

**Ready?** Run `pnpm dev` and open http://localhost:3000! 🎉
