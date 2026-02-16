<p align="center">
  <img src="docs/images/logo.png" alt="StudyAssist Logo" width="120" height="120">
</p>

<h1 align="center">📚 AI Study Assist</h1>

<p align="center">
  <strong>Transform any PDF into personalized study materials using AI-powered multi-agent orchestration</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.9+-blue.svg" alt="Python 3.9+">
  <img src="https://img.shields.io/badge/n8n-workflow-orange.svg" alt="n8n Workflow">
  <img src="https://img.shields.io/badge/FastAPI-0.100+-green.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT">
</p>

---

## 🎯 What is AI Study Assist?

AI Study Assist is an intelligent study companion that leverages **multi-agent AI orchestration** to automatically generate comprehensive study materials from any PDF document. Simply upload your lecture notes, textbooks, or research papers, and let our AI agents create:

- 📝 **Concise Summaries** - Key concepts distilled into easy-to-read summaries
- ❓ **Interactive Quizzes** - Multiple-choice questions to test your understanding
- 🎴 **Flashcards** - Perfect for memorization and quick review sessions

### ✨ Key Differentiator: Continuous Feedback Loop

Unlike traditional AI generators, StudyAssist features a **continuous feedback loop** that allows you to iteratively refine your study materials:

```
Upload → Generate → Review → Request Changes → Regenerate → Repeat until perfect!
```

No need to start over - just tell the AI what you want changed, and only those components get updated while preserving the rest.

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| 📄 **PDF Processing** | Upload any PDF document for intelligent content extraction |
| 🤖 **Multi-Agent System** | Specialized AI agents for summarization, quiz generation, and flashcard creation |
| 🔄 **Feedback Loop** | Iteratively refine content without restarting the workflow |
| 🎮 **Interactive UI** | Engaging interface with a mini-game while AI processes your content |
| 📱 **Responsive Design** | Works seamlessly on desktop and mobile devices |
| ⬇️ **Export Options** | Download your study materials as text files |
| 🎯 **Selective Generation** | Choose which types of study materials you need |

---

## 🎬 Demo

<p align="center">
  <img src="docs/images/demo.gif" alt="StudyAssist Demo" width="800">
</p>

### Screenshots

<details>
<summary>📸 Click to view screenshots</summary>

#### Upload Interface
![Upload Interface](./Users/moshe/OneDrive/Pictures/Screenshots/Screenshot%202026-01-25%20060843.png)

#### Generated Study Materials
![Study Materials](./Users/moshe/OneDrive/Pictures/Screenshots/Screenshot%202026-01-25%20062100.png)

#### Interactive Quiz
![Interactive Quiz](./docs/images/screenshot-quiz.png)

#### Flashcards
![Flashcards](./docs/images/screenshot-flashcards.png)

</details>

---

## 🛠️ Installation

### Prerequisites

- **Python 3.9+**
- **Node.js 18+** (for n8n)
- **n8n** (self-hosted or cloud)
- **Ollama** (for local LLM) or API keys for cloud LLMs

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ai-study-assist.git
   cd ai-study-assist
   ```

2. **Set up the backend**
   ```bash
   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Configure n8n workflow**
   ```bash
   # Import the workflow into your n8n instance
   # File: workflows/Study-Assist-App.json
   ```

4. **Start the backend server**
   ```bash
   python main.py
   # Server runs on http://localhost:5000
   ```

5. **Open the frontend**
   ```bash
   # Simply open index.html in your browser
   # Or use a local server:
   python -m http.server 8080
   # Then visit http://localhost:8080
   ```

### Docker Installation (Coming Soon)

```bash
docker-compose up -d
```

---

## 📖 Usage

### Basic Workflow

1. **Upload Your PDF**
   - Click the upload area or drag and drop your PDF file
   - Supported: Lecture notes, textbooks, research papers, articles

2. **Select Preferences**
   - Choose which study materials you want: Summary, Quiz, Flashcards
   - At least one option must be selected

3. **Generate Content**
   - Click "Start AI Generation"
   - Enjoy the mini-game while AI agents process your document

4. **Review & Refine**
   - Review the generated content
   - Click "Request changes" to provide feedback
   - Example: "Add more detail to the summary" or "Make quiz questions harder"

5. **Export**
   - Download individual components or all materials at once

### Feedback Examples

| Request | What Happens |
|---------|--------------|
| "Add emojis to flashcards" | Only flashcards are regenerated with emojis |
| "Make quiz questions harder" | Only quiz is regenerated with increased difficulty |
| "Simplify the summary" | Only summary is regenerated with simpler language |
| "Add more examples to everything" | All components are regenerated with examples |

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Vanilla JS)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Upload    │  │   Output    │  │    Feedback Chat        │  │
│  │   Panel     │  │   Display   │  │    Interface            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  /upload    │  │  /results   │  │  /feedback-continue     │  │
│  │  endpoint   │  │  endpoint   │  │  endpoint               │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 n8n Workflow Engine                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Supervisor Agent                         │  │
│  │            (Orchestrates workflow routing)                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │ Summarizer  │     │    Quiz     │     │  Flashcard  │        │
│  │   Agent     │     │   Agent     │     │   Agent     │        │
│  └─────────────┘     └─────────────┘     └─────────────┘        │
│         │                    │                    │              │
│         └────────────────────┼────────────────────┘              │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │   Judge Agent   │                          │
│                    │ (Quality Check) │                          │
│                    └─────────────────┘                          │
│                              │                                   │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ Feedback Loop   │◄─── User Feedback        │
│                    │   (Wait Node)   │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Vanilla JavaScript, HTML5, CSS3 | User interface |
| Backend | FastAPI (Python) | API server, request handling |
| Workflow | n8n | AI agent orchestration |
| Vector Store | In-Memory (n8n) | RAG knowledge base |
| LLM | Ollama / OpenAI / Anthropic | Content generation |
| Embeddings | Nomic Embed Text | Document embeddings |

### Agent Responsibilities

| Agent | Role |
|-------|------|
| **Supervisor** | Routes tasks to appropriate worker agents based on current state |
| **Summarizer** | Creates concise, well-structured summaries |
| **Quiz Generator** | Generates multiple-choice questions with correct answers |
| **Flashcard Generator** | Creates front/back flashcard pairs |
| **Judge** | Reviews quality and approves or requests revisions |
| **User Feedback** | Processes user feedback and determines which components need updates |
| **State Manager** | Maintains workflow state across iterations |

---

## 📁 Project Structure

```
ai-study-assist/
├── 📄 index.html              # Main frontend HTML
├── 📄 game.html               # Loading screen mini-game
├── 🎨 style.css               # Application styles
├── 📜 app.js                  # Frontend JavaScript
├── 🐍 main.py                 # FastAPI backend server
├── 📋 requirements.txt        # Python dependencies
├── 📂 workflows/
│   └── Study-Assist-App.json  # n8n workflow definition
├── 📂 docs/
│   ├── 📂 images/             # Documentation images
│   ├── ARCHITECTURE.md        # Detailed architecture docs
│   └── API.md                 # API documentation
├── 📂 tests/
│   ├── test_backend.py        # Backend unit tests
│   └── test_workflow.py       # Workflow integration tests
├── 📄 .gitignore
├── 📄 LICENSE
└── 📄 README.md
```

---

## 🔧 Configuration

### Backend Configuration (`main.py`)

```python
# Toggle between test and production mode
USE_TEST_MODE = True  # Set to False for production

# n8n Webhook URLs
N8N_WEBHOOK_1_URL = "http://localhost:5678/webhook-test/your-webhook-id"
N8N_FEEDBACK_CONTINUE_URL = "http://localhost:5678/webhook-test/feedback-continue"
```

### Frontend Configuration (`app.js`)

```javascript
// API endpoint
var API_BASE = 'http://localhost:5000';
```

### n8n Configuration

1. Import `workflows/Study-Assist-App.json` into n8n
2. Configure your LLM credentials (Ollama, OpenAI, or Anthropic)
3. Set up the embedding model
4. Activate the workflow for production use

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Ways to Contribute

- 🐛 **Report Bugs** - Open an issue describing the bug
- 💡 **Suggest Features** - Share your ideas in discussions
- 📝 **Improve Documentation** - Help make our docs better
- 🔧 **Submit PRs** - Fix bugs or implement features

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `pytest tests/`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- Python: Follow PEP 8
- JavaScript: Use consistent formatting (no semicolons optional)
- Commits: Use conventional commit messages

---

## 📊 Roadmap

- [x] Basic PDF processing and content generation
- [x] Multi-agent orchestration with n8n
- [x] Interactive quiz and flashcard UI
- [x] Continuous feedback loop
- [ ] Docker containerization
- [ ] Cloud deployment guide (Vercel, Railway)
- [ ] Support for more file formats (DOCX, PPTX)
- [ ] Spaced repetition algorithm for flashcards
- [ ] User accounts and saved study sessions
- [ ] Mobile app (React Native)
- [ ] Browser extension for quick captures

---

## ❓ FAQ

<details>
<summary><strong>What LLMs are supported?</strong></summary>

Currently, the project is configured for Ollama (local LLMs like Mistral). You can modify the n8n workflow to use OpenAI, Anthropic Claude, or any other LLM provider supported by n8n.
</details>

<details>
<summary><strong>Can I use this without n8n?</strong></summary>

The current architecture relies on n8n for agent orchestration. However, you could adapt the logic to use LangChain or a custom orchestration layer.
</details>

<details>
<summary><strong>What's the maximum PDF size?</strong></summary>

The default configuration handles PDFs up to 10MB. For larger documents, consider increasing timeouts and using chunking strategies.
</details>

<details>
<summary><strong>Is my data private?</strong></summary>

When using local LLMs (Ollama), all processing happens on your machine. If using cloud LLM providers, data is sent to their servers according to their privacy policies.
</details>

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [n8n](https://n8n.io/) - Workflow automation platform
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Ollama](https://ollama.ai/) - Local LLM runner
- All contributors and users of this project

---

## 📬 Contact

- **Author:** Mohamed
- **Project Link:** [https://github.com/yourusername/ai-study-assist](https://github.com/yourusername/ai-study-assist)

---

<p align="center">
  Made with ❤️ for students everywhere
</p>

<p align="center">
  <a href="#-ai-study-assist">⬆️ Back to Top</a>
</p>
