/*
  StudyAssist Static Frontend
  - No frameworks
  - No build tools
  - No ES modules/imports
*/

(function () {
  'use strict';

  var API_BASE = 'http://localhost:5000';

  var state = {
    step: 1,
    file: null,
    preferences: {
      summary: true,
      quiz: false,
      flashcards: false
    },
    isProcessing: false,
    backendStatus: 'checking', // checking | connected | error
    messages: [
      { role: 'system', text: 'Welcome to AI Study Assist! Upload your PDF to begin.' }
    ],
    chatOpen: false,
    chatInput: '',
    outputData: null,
    jobId: null,
    polling: { intervalId: null, startedAt: 0 },

    outputUI: {
      activeTab: 'summary',
      currentFlashcard: 0,
      isFlipped: false,
      selectedAnswers: {},
      showQuizResults: false
    }
  };

  // --------- DOM helpers ---------
  function $(id) {
    return document.getElementById(id);
  }

  var ICONS = {
    book: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H3z"></path><path d="M21 4h-7a3 3 0 0 0-3 3v14a3 3 0 0 1 3-3h7z"></path></svg>',
    upload: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path></svg>',
    fileText: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path></svg>',
    help: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"></path><path d="M12 17h.01"></path></svg>',
    layers: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l10 6-10 6L2 8l10-6z"></path><path d="M2 12l10 6 10-6"></path><path d="M2 16l10 6 10-6"></path></svg>',
    download: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>'
  };

  function icon(name) {
    var span = el('span');
    span.innerHTML = ICONS[name] || '';
    return span;
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = String(text == null ? '' : text);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // --------- Extraction/parsing (ported from React version) ---------
  function unwrapData(data) {
    if (Array.isArray(data) && data.length > 0) return data[0];
    return data;
  }

  function parseFlashcardsFromText(text) {
    var flashcards = [];
    var raw = String(text || '');

    // Normalize text: handle escaped newlines and different line endings
    var normalized = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

    // Strategy 1: Split by clear separators like === FLASHCARD X === or Flashcard X:
    var splitPattern = /(?:===\s*FLASHCARD\s*\d+\s*===|Flashcard\s*\d+\s*[:\-]|Card\s*\d+\s*[:\-]|(?:\n|^)\d+\.\s+(?=(?:FRONT|QUESTION|TERM)))/gi;
    var parts = normalized.split(splitPattern);
    
    for (var i = 0; i < parts.length; i++) {
        var block = parts[i].trim();
        if (!block) continue;
        
        var fb = findFrontBack(block);
        if (fb.front && fb.back) {
            flashcards.push(fb);
        }
    }

    // Fallback: If no cards found, try a very simple FRONT/BACK lookahead split
    if (flashcards.length === 0) {
        var simpleBlocks = normalized.split(/(?=(?:FRONT|QUESTION|TERM)\s*[:\-])/i);
        for (var j = 0; j < simpleBlocks.length; j++) {
            var b = simpleBlocks[j].trim();
            if (!b) continue;
            var res = findFrontBack(b);
            if (res.front && res.back) flashcards.push(res);
        }
    }

    return flashcards;
  }

  function findFrontBack(block) {
      // Use lookaheads to ensure we don't grab the NEXT front/back label if the block has multiple
      var frontMatch = block.match(/(?:FRONT|QUESTION|TERM)\s*[:\-]\s*([\s\S]*?)(?=(?:BACK|ANSWER|DEFINITION)\s*[:\-]|$)/i);
      var backMatch = block.match(/(?:BACK|ANSWER|DEFINITION)\s*[:\-]\s*([\s\S]*?)(?=(?:FRONT|QUESTION|TERM)\s*[:\-]|$)/i);
      
      return { 
          front: frontMatch ? frontMatch[1].trim() : '', 
          back: backMatch ? backMatch[1].trim() : '' 
      };
  }

  function parseQuizFromText(text) {
    var questions = [];
    var normalizedText = String(text || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    
    // Split by "Q1:", "Question 1:", etc., including cases where there's no newline before the next question
    var parts = normalizedText.split(/(?=(?:^|\n|\s+)(?:Q\d+|Question\s*\d+)\s*[:\-])/i);

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;

      // Identify start of options
      var lines = part.split('\n');
      var optionStartIndex = -1;
      
      for (var l = 0; l < lines.length; l++) {
          var line = lines[l].trim();
          // Look for "a)", "1.", "a." start patterns
          if (line.match(/^([a-dA-D]|\d+)[).:-]\s+/)) {
              optionStartIndex = l;
              break;
          }
      }

      var questionText = '';
      var optionLines = [];

      if (optionStartIndex !== -1) {
          var qLines = lines.slice(0, optionStartIndex);
          questionText = qLines.join('\n').replace(/^(?:Q\d+|Question\s*\d+)\s*[:\-]?/i, '').trim();
          optionLines = lines.slice(optionStartIndex);
      } else {
           if (part.match(/^(?:Q\d+|Question\s*\d+)/i)) {
               questionText = part.replace(/^(?:Q\d+|Question\s*\d+)\s*[:\-]?/i, '').trim();
           } else {
               continue; 
           }
      }

      var options = [];
      var correctAnswer = null;

      for (var k = 0; k < optionLines.length; k++) {
        var optLine = optionLines[k].trim();
        if (!optLine) continue;
        
        var optMatch = optLine.match(/^([a-dA-D]|\d+)[).:-]\s*(.+)$/);
        if (optMatch) {
          var optText = optMatch[2].trim();

          // Check for inline correct answer
          var inlineCorrect = optText.match(/\(Correct Answer:\s*([a-dA-D]|\d+)\)/i);
          if (inlineCorrect) {
             var ans = inlineCorrect[1].toLowerCase();
             var idx = ['a', 'b', 'c', 'd'].indexOf(ans);
             if (idx >= 0) correctAnswer = idx;
             else if (!isNaN(parseInt(ans))) correctAnswer = parseInt(ans) - 1;
             
             optText = optText.replace(inlineCorrect[0], '').trim();
          }

          options.push(optText);
        } else {
             if (options.length > 0 && !optLine.match(/^(?:Correct\s*Answer|Answer|Correct)\s*:/i)) {
                 options[options.length - 1] += ' ' + optLine;
             }
        }
        
        var correctMatchLine = optLine.match(/^(?:Correct\s*Answer|Answer|Correct)\s*:\s*([a-dA-D]|\d+|[^\n]+)/i);
        if (correctMatchLine) {
           var raw = String(correctMatchLine[1]).trim();
           var idxSub = ['a', 'b', 'c', 'd'].indexOf(raw.toLowerCase());
           if (idxSub >= 0) correctAnswer = idxSub;
           else if (!isNaN(parseInt(raw, 10))) correctAnswer = parseInt(raw, 10) - 1;
        }
      }

      // Final loose check for correct answer
      if (correctAnswer === null) {
          var looseMatch = part.match(/\(Correct Answer:\s*([a-dA-D]|\d+)\)/i);
          if (looseMatch) {
             var ansSub = looseMatch[1].toLowerCase();
             var idxSub2 = ['a', 'b', 'c', 'd'].indexOf(ansSub);
             if (idxSub2 >= 0) correctAnswer = idxSub2;
          }
      }

      if (questionText && options.length >= 2) {
        questions.push({
          question: questionText,
          options: options,
          correctAnswer: typeof correctAnswer === 'number' ? correctAnswer : 0
        });
      }
    }

    return questions;
  }

  function extractSummary(rawData) {
    var data = unwrapData(rawData);
    if (!data) return null;

    if (typeof data.summary === 'string' && data.summary.length > 20) {
      var s = data.summary.toLowerCase();
      if (!s.includes('no summary') && !s.includes('not generated') && !s.includes('was generated.')) {
        return data.summary;
      }
    }

    if (data.study_pack && data.study_pack.summary && typeof data.study_pack.summary.content === 'string') {
      return data.study_pack.summary.content;
    }

    if (data.summary && typeof data.summary.content === 'string') {
      return data.summary.content;
    }

    return null;
  }

  function normalizeQuizItem(item) {
    if (!item || typeof item !== 'object') return null;
    var question = item.question || item.q || item.prompt || '';
    var options = item.options || item.choices || item.answers || item.options_list || [];
    if (typeof options === 'string') {
      options = options.split(/\n|;|\|/).map(function (o) { return o.trim(); }).filter(Boolean);
    }
    if (!Array.isArray(options)) options = [];

    var correctAnswer = item.correctAnswer;
    if (typeof correctAnswer === 'undefined') correctAnswer = item.correct_index;
    if (typeof correctAnswer === 'undefined') correctAnswer = item.correct;

    var answerText = item.answer || item.correct_answer || item.correctAnswerText || null;
    if (typeof correctAnswer === 'string') {
      var idx = ['a', 'b', 'c', 'd'].indexOf(correctAnswer.toLowerCase());
      if (idx >= 0) correctAnswer = idx;
      else if (!isNaN(parseInt(correctAnswer, 10))) correctAnswer = parseInt(correctAnswer, 10) - 1;
    }
    if (typeof correctAnswer !== 'number' && answerText && options.length) {
      var found = options.findIndex(function (o) { return o.toLowerCase() === String(answerText).toLowerCase(); });
      if (found >= 0) correctAnswer = found;
    }

    if (!question) return null;
    return {
      question: question,
      options: options,
      correctAnswer: typeof correctAnswer === 'number' ? correctAnswer : 0
    };
  }

  function extractQuiz(rawData) {
    var data = unwrapData(rawData);
    if (!data) return [];

    if (Array.isArray(data.quiz) && data.quiz.length > 0) {
      var normalized = data.quiz.map(normalizeQuizItem).filter(Boolean);
      if (normalized.length > 0) return normalized;
    }

    if (typeof data.quiz === 'string' && data.quiz.length > 50) {
      var s = data.quiz.toLowerCase();
      if (!s.includes('no quiz') && !s.includes('not generated') && !s.includes('was generated.')) {
        var parsed = parseQuizFromText(data.quiz);
        if (parsed.length > 0) return parsed;
      }
    }

    if (data.study_pack && data.study_pack.quiz && Array.isArray(data.study_pack.quiz.content) && data.study_pack.quiz.content.length > 0) {
      return data.study_pack.quiz.content.map(normalizeQuizItem).filter(Boolean);
    }

    if (data.quiz && Array.isArray(data.quiz.content) && data.quiz.content.length > 0) {
      return data.quiz.content.map(normalizeQuizItem).filter(Boolean);
    }

    return [];
  }

  function extractFlashcards(rawData) {
    var data = unwrapData(rawData);
    if (!data) return [];

    if (Array.isArray(data.flashcards) && data.flashcards.length > 0 && typeof data.flashcards[0] === 'object') {
      return data.flashcards.map(function (f) {
        return {
          front: f.front || f.question || f.term || '',
          back: f.back || f.answer || f.definition || ''
        };
      });
    }

    if (typeof data.flashcards === 'string' && data.flashcards.length > 50) {
      var s = data.flashcards.toLowerCase();
      if (!s.includes('no flashcard') && !s.includes('not generated')) {
        var parsed = parseFlashcardsFromText(data.flashcards);
        if (parsed.length > 0) return parsed;
      }
    }

    if (data.study_pack && data.study_pack.flashcards && Array.isArray(data.study_pack.flashcards.content) && data.study_pack.flashcards.content.length > 0) {
      return data.study_pack.flashcards.content.map(function (f) {
        return {
          front: f.front || f.question || f.term || '',
          back: f.back || f.answer || f.definition || ''
        };
      });
    }

    if (data.flashcards && Array.isArray(data.flashcards.content) && data.flashcards.content.length > 0) {
      return data.flashcards.content.map(function (f) {
        return {
          front: f.front || f.question || f.term || '',
          back: f.back || f.answer || f.definition || ''
        };
      });
    }

    return [];
  }

  // --------- API / polling ---------
  function setBackendStatus(status) {
    state.backendStatus = status;
    renderSidebarStatus();
  }

  function checkBackend() {
    setBackendStatus('checking');

    return fetch(API_BASE + '/health')
      .then(function (res) {
        if (res.ok) setBackendStatus('connected');
        else setBackendStatus('error');
      })
      .catch(function () {
        setBackendStatus('error');
      });
  }

  function stopPolling() {
    if (state.polling.intervalId) {
      clearInterval(state.polling.intervalId);
      state.polling.intervalId = null;
    }
    state.jobId = null;
  }

  function startPolling(jobId) {
    stopPolling();
    state.jobId = jobId;
    state.polling.startedAt = Date.now();

    var POLLING_TIMEOUT = 120000;

    state.polling.intervalId = setInterval(function () {
      if (!state.jobId) return;

      if (Date.now() - state.polling.startedAt > POLLING_TIMEOUT) {
        pushMessage('system', 'The request timed out. The AI agents took too long to respond. Please try again.');
        state.isProcessing = false;
        stopPolling();
        state.step = 1;
        render();
        return;
      }

      fetch(API_BASE + '/results/' + encodeURIComponent(state.jobId))
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return null; }).then(function () {
              return null;
            });
          }
          return res.json();
        })
        .then(function (result) {
          if (!result) return;

          if (result.status === 'complete') {
            state.outputData = result.data;
            initOutputUIFromData();
            state.isProcessing = false;
            stopPolling();
            state.step = 2;
            pushMessage('system', 'Processing complete! You can now review your study materials.');
            render();
          }
        })
        .catch(function () {
          // keep polling unless catastrophic
        });
    }, 3000);

    renderSidebarStatus();
  }

  function uploadAndStart() {
    if (!state.file) return;

    state.isProcessing = true;
    pushMessage('system', 'File uploaded. Initializing AI agents and starting the generation process...');
    state.step = 2;
    render();

    var formData = new FormData();
    formData.append('file', state.file);
    formData.append('summary', String(!!state.preferences.summary));
    formData.append('quiz', String(!!state.preferences.quiz));
    formData.append('flashcards', String(!!state.preferences.flashcards));

    fetch(API_BASE + '/upload', {
      method: 'POST',
      body: formData
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Server error during upload');
        return res.json();
      })
      .then(function (result) {
        if (result && result.job_id) {
          pushMessage('system', 'Processing started with Job ID: ' + result.job_id + '. Please wait...');
          startPolling(result.job_id);
        } else {
          throw new Error('Backend did not return a job ID.');
        }
      })
      .catch(function (err) {
        pushMessage('system', 'Error starting the process: ' + (err && err.message ? err.message : 'Unknown error'));
        state.isProcessing = false;
        stopPolling();
        state.step = 1;
        render();
      });
  }

  function sendFeedback(text) {
    var msg = (text || '').trim();
    if (!msg) return;

    pushMessage('user', msg);

    return fetch(API_BASE + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatInput: msg })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to send feedback');
        return res.json().catch(function () { return null; });
      })
      .then(function () {
        pushMessage('system', 'Feedback received! Your request is being reviewed now.');
      })
      .catch(function () {
        pushMessage('system', 'Failed to send feedback to backend.');
      })
      .finally(function () {
        renderChat();
      });
  }

  // --------- Messages / chat ---------
  function pushMessage(role, text) {
    state.messages.push({ role: role, text: String(text || '') });
    renderChat();
  }

  function setChatOpen(open) {
    state.chatOpen = !!open;
    renderChat();
  }

  // --------- Output UI ---------
  function initOutputUIFromData() {
    var summary = extractSummary(state.outputData);
    var quiz = extractQuiz(state.outputData);
    var flash = extractFlashcards(state.outputData);

    var tab = 'summary';
    if (summary && summary.length > 0) tab = 'summary';
    else if (quiz && quiz.length > 0) tab = 'quiz';
    else if (flash && flash.length > 0) tab = 'flashcards';

    state.outputUI = {
      activeTab: tab,
      currentFlashcard: 0,
      isFlipped: false,
      selectedAnswers: {},
      showQuizResults: false
    };
  }

  function downloadAsText(content, filename) {
    var blob = new Blob([String(content || '')], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function calculateScore(quizContent) {
    if (!quizContent || quizContent.length === 0) return 0;
    var correct = 0;
    for (var i = 0; i < quizContent.length; i++) {
      if (state.outputUI.selectedAnswers[i] === quizContent[i].correctAnswer) correct++;
    }
    return Math.round((correct / quizContent.length) * 100);
  }

  // --------- Render ---------
  function renderSidebarStatus() {
    var backendDot = $('backendDot');
    var backendText = $('backendText');
    var agentDot = $('agentDot');
    var agentText = $('agentText');

    if (backendDot) {
      backendDot.className = 'dot ' +
        (state.backendStatus === 'connected' ? 'is-ok' : state.backendStatus === 'checking' ? 'is-warn' : 'is-bad');
      if (state.backendStatus === 'checking') backendDot.className += ' is-pulse';
    }
    setText(backendText, state.backendStatus);

    var working = state.isProcessing || !!state.jobId;
    if (agentDot) {
      agentDot.className = 'dot ' + (working ? 'is-warn is-pulse' : 'is-ok');
    }
    setText(agentText, working ? 'Working...' : 'Idle');
  }

  function renderNav() {
    var navUpload = $('navUpload');
    var navReview = $('navReview');

    if (navUpload) navUpload.classList.toggle('is-active', state.step === 1);
    if (navReview) {
      navReview.classList.toggle('is-active', state.step === 2);
      navReview.disabled = !state.outputData;
    }
  }

  function renderContent() {
    var content = $('content');
    if (!content) return;

    content.innerHTML = '';

    if (state.step === 1) {
      content.appendChild(renderUploadView());
      return;
    }

    // step 2
    if (state.outputData) {
      content.appendChild(renderInteractiveOutput());
    } else {
      content.appendChild(renderProcessingView());
    }
  }

  function renderUploadView() {
    var wrap = el('div', 'view upload-view fade-in');

    var hero = el('div', 'hero');
    var h = el('h3', null, 'Ready to master your studies?');
    var p = el('p', null, 'Upload your PDF and let our AI agents generate specialized study materials for you.');
    hero.appendChild(h);
    hero.appendChild(p);

    var uploadCard = el('div', 'upload-card' + (state.file ? ' is-filled' : ''));
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,application/pdf';
    fileInput.style.display = 'none';
    fileInput.id = 'fileInput';

    fileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f && f.type === 'application/pdf') {
        state.file = f;
        pushMessage('user', 'Uploaded: ' + f.name);
        render();
      } else if (f) {
        alert('Please upload a PDF file only.');
        e.target.value = '';
      }
    });

    uploadCard.addEventListener('click', function () {
      fileInput.click();
    });

    if (state.file) {
      var badgeOk = el('div', 'badge ok');
      badgeOk.textContent = '✓';
      var name = el('div', 'upload-title', state.file.name);

      var changeBtn = el('button', 'link-btn', 'Change file');
      changeBtn.type = 'button';
      changeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        fileInput.click();
      });

      uploadCard.appendChild(badgeOk);
      uploadCard.appendChild(name);
      uploadCard.appendChild(changeBtn);
    } else {
      var badge = el('div', 'badge');
      badge.appendChild(icon('upload'));
      var title = el('div', 'upload-title', 'Click to upload PDF');
      var hint = el('div', 'muted', 'PDF Files Only');
      uploadCard.appendChild(badge);
      uploadCard.appendChild(title);
      uploadCard.appendChild(hint);
    }

    var prefs = el('div', 'prefs-card');
    prefs.appendChild(el('h4', null, 'Select Output Preferences'));

    var grid = el('div', 'prefs-grid');
    var keys = ['summary', 'quiz', 'flashcards'];

    keys.forEach(function (k) {
      var item = el('div', 'pref' + (state.preferences[k] ? ' is-on' : ''), k);
      item.style.textTransform = 'capitalize';
      item.addEventListener('click', function (ev) {
        ev.preventDefault();
        state.preferences[k] = !state.preferences[k];
        render();
      });
      grid.appendChild(item);
    });

    prefs.appendChild(grid);

    var btn = el('button', 'primary', state.isProcessing || state.jobId ? 'Processing... Please Wait' : 'Start AI Generation');
    btn.type = 'button';
    btn.disabled = !state.file || state.isProcessing || !!state.jobId;

    btn.addEventListener('click', function () {
      uploadAndStart();
    });

    wrap.appendChild(hero);
    wrap.appendChild(uploadCard);
    wrap.appendChild(fileInput);
    wrap.appendChild(prefs);
    wrap.appendChild(btn);

    return wrap;
  }

  function renderProcessingView() {
    var wrap = el('div', 'centered fade-in');
    wrap.style.padding = '0';
    wrap.style.overflow = 'hidden';

    var iframe = el('iframe');
    iframe.src = 'game.html';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = 'var(--radius-xl)';
    iframe.style.background = '#0f172a';
    
    wrap.appendChild(iframe);
    return wrap;
  }

  function renderInteractiveOutput() {
    var data = state.outputData;

    var summaryContent = extractSummary(data);
    var quizContent = extractQuiz(data);
    var flashcardsContent = extractFlashcards(data);

    var hasSummary = !!(summaryContent && summaryContent.length);
    var hasQuiz = !!(quizContent && quizContent.length);
    var hasFlashcards = !!(flashcardsContent && flashcardsContent.length);

    var wrap = el('div', 'output fade-in');

    // If data exists but nothing extracted, show raw JSON.
    if (!hasSummary && !hasQuiz && !hasFlashcards) {
      var empty = el('div', 'centered');
      empty.appendChild(el('h3', null, 'Content Received'));
      empty.appendChild(el('p', null, "The data structure from n8n needs to be displayed. Here's what we got:"));

      var preWrap = el('div', 'panel');
      var pre = el('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.margin = '0';
      pre.style.fontSize = '12px';
      pre.textContent = JSON.stringify(data, null, 2);
      preWrap.appendChild(pre);

      wrap.appendChild(empty);
      wrap.appendChild(preWrap);
      return wrap;
    }

    // Header
    var header = el('div', 'output-header');

    var title = el('div', 'output-title');
    title.appendChild(el('h3', null, 'Your Study Materials'));
    title.appendChild(el('p', null, 'AI-generated content ready for review'));

    var controls = el('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '10px';

    var tabs = el('div', 'tabs');

    function addTab(name, label, iconName, available) {
      if (!available) return;
      var b = el('button', 'tab' + (state.outputUI.activeTab === name ? ' is-active' : ''));
      b.type = 'button';
      b.addEventListener('click', function () {
        state.outputUI.activeTab = name;
        state.outputUI.isFlipped = false;
        render();
      });
      
      if (iconName && ICONS[iconName]) {
          var ic = el('span', null);
          ic.style.display = 'flex';
          ic.innerHTML = ICONS[iconName];
          b.appendChild(ic);
      }
      
      b.appendChild(el('span', null, label));
      tabs.appendChild(b);
    }

    addTab('summary', 'Summary', 'fileText', hasSummary);
    addTab('quiz', 'Quiz', 'help', hasQuiz);
    addTab('flashcards', 'Flashcards', 'layers', hasFlashcards);

    // var downloadAllBtn = el('button', 'download-all', 'Download All');
    // downloadAllBtn.type = 'button';

    var downloadAllBtn = el('button', 'download-all');
    downloadAllBtn.type = 'button';
    // add icon + label
    var daIcon = icon('download');
    daIcon.style.marginRight = '10px';
    downloadAllBtn.appendChild(daIcon);
    downloadAllBtn.appendChild(el('span', null, 'Download All'));

    downloadAllBtn.addEventListener('click', function () {
      var text = '📚 STUDY MATERIALS\n' + '='.repeat(50) + '\n\n';
      if (hasSummary) {
        text += '📝 SUMMARY\n' + '-'.repeat(30) + '\n' + summaryContent + '\n\n';
      }
      if (hasQuiz) {
        text += '❓ QUIZ\n' + '-'.repeat(30) + '\n';
        for (var i = 0; i < quizContent.length; i++) {
          var q = quizContent[i];
          text += '\nQ' + (i + 1) + ': ' + q.question + '\n';
          if (q.options) {
            for (var j = 0; j < q.options.length; j++) {
              text += '  ' + String.fromCharCode(65 + j) + '. ' + q.options[j] + '\n';
            }
          }
          var answerLetter = (typeof q.correctAnswer === 'number') ? String.fromCharCode(65 + q.correctAnswer) : (q.correctAnswer || q.answer || 'N/A');
          text += 'Answer: ' + answerLetter + '\n';
        }
        text += '\n';
      }
      if (hasFlashcards) {
        text += '🎴 FLASHCARDS\n' + '-'.repeat(30) + '\n';
        for (var k = 0; k < flashcardsContent.length; k++) {
          var card = flashcardsContent[k];
          text += '\nCard ' + (k + 1) + ':\n  Front: ' + card.front + '\n  Back: ' + card.back + '\n';
        }
      }
      downloadAsText(text, 'study-materials.txt');
    });

    controls.appendChild(tabs);
    controls.appendChild(downloadAllBtn);

    header.appendChild(title);
    header.appendChild(controls);

    // Panel content
    var panel = el('div', 'panel');

    if (state.outputUI.activeTab === 'summary' && hasSummary) {
      panel.appendChild(renderSummaryTab(summaryContent));
    }

    if (state.outputUI.activeTab === 'quiz' && hasQuiz) {
      panel.appendChild(renderQuizTab(quizContent));
    }

    if (state.outputUI.activeTab === 'flashcards' && hasFlashcards) {
      panel.appendChild(renderFlashcardsTab(flashcardsContent));
    }

    wrap.appendChild(header);
    wrap.appendChild(panel);

    return wrap;
  }

  function renderSummaryTab(summaryContent) {
    var root = el('div', 'fade-in');

    var head = el('div', 'card-head');
    var left = el('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '12px';

    var chip = el('div', 'chip blue');
    chip.appendChild(icon('fileText'));
    left.appendChild(chip);
    left.appendChild(el('div', null, 'Summary')).style.fontWeight = '900';

    // var download = el('button', 'small-btn', 'Download');
    // download.type = 'button';
    // download.addEventListener('click', function () {
    //   downloadAsText(summaryContent, 'study-summary.txt');
    // });

    // in renderSummaryTab: replace small download button creation

    var download = el('button', 'small-btn');
    download.type = 'button';
    var sIcon = icon('download');
    sIcon.style.marginRight = '8px';
    download.appendChild(sIcon);
    download.appendChild(el('span', null, 'Download'));
    download.addEventListener('click', function () {
      downloadAsText(summaryContent, 'study-summary.txt');
    });

    head.appendChild(left);
    head.appendChild(download);

    var box = el('div', 'summary-box');
    var p = el('p', 'summary-text');
    p.textContent = summaryContent;
    box.appendChild(p);

    root.appendChild(head);
    root.appendChild(box);
    return root;
  }

  function renderQuizTab(quizContent) {
    var root = el('div', 'fade-in');

    var head = el('div', 'card-head');
    var left = el('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '12px';

    var chip = el('div', 'chip purple');
    chip.appendChild(icon('help'));
    left.appendChild(chip);

    var title = el('div');
    title.appendChild(el('div', null, 'Interactive Quiz')).style.fontWeight = '900';
    title.appendChild(el('div', 'muted', quizContent.length + ' questions'));
    left.appendChild(title);

    // var download = el('button', 'small-btn', 'Download');
    // download.type = 'button';

    var download = el('button', 'small-btn');
    download.type = 'button';
    var qIcon = icon('download');
    qIcon.style.marginRight = '8px';
    download.appendChild(qIcon);
    download.appendChild(el('span', null, 'Download'));

    download.addEventListener('click', function () {
      var text = 'STUDY QUIZ\n' + '='.repeat(50) + '\n\n';
      for (var i = 0; i < quizContent.length; i++) {
        var q = quizContent[i];
        text += 'Question ' + (i + 1) + ': ' + q.question + '\n';
        if (q.options) {
          for (var j = 0; j < q.options.length; j++) {
            text += '  ' + String.fromCharCode(65 + j) + '. ' + q.options[j] + '\n';
          }
        }
        var answerLetter = (typeof q.correctAnswer === 'number') ? String.fromCharCode(65 + q.correctAnswer) : (q.correctAnswer || q.answer || 'N/A');
        text += 'Answer: ' + answerLetter + '\n\n';
      }
      downloadAsText(text, 'study-quiz.txt');
    });

    head.appendChild(left);
    head.appendChild(download);

    root.appendChild(head);

    var list = el('div', 'quiz-list');

    for (var i = 0; i < quizContent.length; i++) {
      (function (qIndex) {
        var q = quizContent[qIndex];

        var card = el('div', 'q-card');
        var titleRow = el('p', 'q-title');
        titleRow.appendChild(el('span', 'q-n', String(qIndex + 1)));
        titleRow.appendChild(el('span', null, q.question));
        card.appendChild(titleRow);

        var opts = el('div', 'opts');
        var options = q.options || [];

        for (var j = 0; j < options.length; j++) {
          (function (optIndex) {
            var optText = options[optIndex];

            var isSelected = state.outputUI.selectedAnswers[qIndex] === optIndex;
            var isCorrect = state.outputUI.showQuizResults && optIndex === q.correctAnswer;
            var isWrong = state.outputUI.showQuizResults && isSelected && optIndex !== q.correctAnswer;

            var opt = el('div', 'opt' +
              (isSelected ? ' is-selected' : '') +
              (isCorrect ? ' is-correct' : '') +
              (isWrong ? ' is-wrong' : ''),
              null);

            var bullet = el('span', 'bullet', (isSelected || isCorrect) ? '✓' : '');
            var label = el('span', null, optText);

            opt.appendChild(bullet);
            opt.appendChild(label);

            opt.addEventListener('click', function () {
              if (state.outputUI.showQuizResults) return;
              state.outputUI.selectedAnswers[qIndex] = optIndex;
              render();
            });

            opts.appendChild(opt);
          })(j);
        }

        card.appendChild(opts);
        list.appendChild(card);
      })(i);
    }

    root.appendChild(list);

    if (!state.outputUI.showQuizResults) {
      var submit = el('button', 'submit-quiz', 'Submit Quiz & See Results');
      submit.type = 'button';
      submit.addEventListener('click', function () {
        state.outputUI.showQuizResults = true;
        render();
      });
      root.appendChild(submit);
    } else {
      var score = el('div', 'score');
      var row = el('div', 'score-row');

      var leftScore = el('div');
      leftScore.appendChild(el('small', null, 'Your Score'));
      leftScore.appendChild(el('div', 'pct', String(calculateScore(quizContent)) + '%'));

      var badge = el('div');
      badge.style.width = '74px';
      badge.style.height = '74px';
      badge.style.borderRadius = '999px';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.fontWeight = '1000';
      badge.style.fontSize = '28px';
      var pct = calculateScore(quizContent);
      badge.style.background = pct >= 70
        ? 'linear-gradient(135deg, #4ade80, #10b981)'
        : 'linear-gradient(135deg, #fbbf24, #f97316)';
      badge.textContent = pct >= 70 ? '✓' : '↻';

      row.appendChild(leftScore);
      row.appendChild(badge);

      score.appendChild(row);

      var again = el('button', 'try-again', 'Try Again');
      again.type = 'button';
      again.addEventListener('click', function () {
        state.outputUI.showQuizResults = false;
        state.outputUI.selectedAnswers = {};
        render();
      });
      score.appendChild(again);

      root.appendChild(score);
    }

    return root;
  }

  function renderFlashcardsTab(flashcardsContent) {
    var root = el('div', 'fade-in');

    var head = el('div', 'card-head');
    var left = el('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '12px';

    var chip = el('div', 'chip amber');
    chip.appendChild(icon('layers'));
    left.appendChild(chip);

    var title = el('div');
    title.appendChild(el('div', null, 'Flashcards')).style.fontWeight = '900';
    title.appendChild(el('div', 'muted', flashcardsContent.length + ' cards • Click to flip'));
    left.appendChild(title);

    // var download = el('button', 'small-btn', 'Download');
    // download.type = 'button';

    var download = el('button', 'small-btn');
    download.type = 'button';
    var fIcon = icon('download');
    fIcon.style.marginRight = '8px';
    download.appendChild(fIcon);
    download.appendChild(el('span', null, 'Download'));

    download.addEventListener('click', function () {
      var text = 'STUDY FLASHCARDS\n' + '='.repeat(50) + '\n\n';
      for (var i = 0; i < flashcardsContent.length; i++) {
        var c = flashcardsContent[i];
        text += 'Card ' + (i + 1) + '\n' + '-'.repeat(30) + '\n';
        text += 'Front: ' + c.front + '\n';
        text += 'Back: ' + c.back + '\n\n';
      }
      downloadAsText(text, 'study-flashcards.txt');
    });

    head.appendChild(left);
    head.appendChild(download);

    root.appendChild(head);

    var current = clamp(state.outputUI.currentFlashcard, 0, Math.max(0, flashcardsContent.length - 1));
    state.outputUI.currentFlashcard = current;

    var wrap = el('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';

    var flashWrap = el('div', 'flash-wrap flashcard-container');
    flashWrap.addEventListener('click', function () {
      state.outputUI.isFlipped = !state.outputUI.isFlipped;
      render();
    });

    var flash = el('div', 'flashcard' + (state.outputUI.isFlipped ? ' rotate-y-180' : ''));

    var front = el('div', 'flashcard-face flashcard-front');
    front.appendChild(el('div', 'flash-meta', 'Question'));
    front.appendChild(el('div', 'flash-text', flashcardsContent[current].front || 'No content'));
    front.appendChild(el('div', 'flash-hint', 'Click to reveal answer'));

    var back = el('div', 'flashcard-face flashcard-back');
    back.appendChild(el('div', 'flash-meta', 'Answer'));
    back.appendChild(el('div', 'flash-text', flashcardsContent[current].back || 'No content'));
    back.appendChild(el('div', 'flash-hint', 'Click to flip back'));

    flash.appendChild(front);
    flash.appendChild(back);
    flashWrap.appendChild(flash);

    var nav = el('div', 'flash-nav');
    var prev = el('button', 'nav-square', '‹');
    prev.type = 'button';
    prev.addEventListener('click', function (e) {
      e.stopPropagation();
      state.outputUI.isFlipped = false;
      state.outputUI.currentFlashcard = (current > 0 ? current - 1 : flashcardsContent.length - 1);
      render();
    });

    var next = el('button', 'nav-square', '›');
    next.type = 'button';
    next.addEventListener('click', function (e) {
      e.stopPropagation();
      state.outputUI.isFlipped = false;
      state.outputUI.currentFlashcard = (current < flashcardsContent.length - 1 ? current + 1 : 0);
      render();
    });

    var dots = el('div', 'dots');
    for (var i = 0; i < flashcardsContent.length; i++) {
      (function (idx) {
        var b = el('button', 'dot-btn' + (idx === current ? ' is-active' : ''));
        b.type = 'button';
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          state.outputUI.isFlipped = false;
          state.outputUI.currentFlashcard = idx;
          render();
        });
        dots.appendChild(b);
      })(i);
    }

    nav.appendChild(prev);
    nav.appendChild(dots);
    nav.appendChild(next);

    var count = el('div', 'flash-count', 'Card ' + (current + 1) + ' of ' + flashcardsContent.length);

    wrap.appendChild(flashWrap);
    wrap.appendChild(nav);
    wrap.appendChild(count);

    root.appendChild(wrap);

    return root;
  }

  function renderChat() {
    var panel = $('chatPanel');
    var toggle = $('chatToggle');
    var toggleIcon = $('chatToggleIcon');

    if (toggle) {
      toggle.setAttribute('aria-expanded', state.chatOpen ? 'true' : 'false');
    }

    if (toggleIcon) {
      toggleIcon.textContent = state.chatOpen ? '×' : '💬';
    }

    if (!panel) return;
    panel.hidden = !state.chatOpen;

    var body = $('chatBody');
    if (!body) return;

    body.innerHTML = '';

    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      var row = el('div', 'msg' + (m.role === 'user' ? ' is-user' : ''));
      var bubble = el('div', 'msg-bubble ' + (m.role === 'user' ? 'user' : 'system'));
      bubble.textContent = m.text;
      row.appendChild(bubble);
      body.appendChild(row);
    }

    // Scroll to bottom
    body.scrollTop = body.scrollHeight;
  }

  function render() {
    renderSidebarStatus();
    renderNav();
    renderContent();
    renderChat();
  }

  // --------- Events / init ---------
  function resetApp() {
    stopPolling();
    state.step = 1;
    state.file = null;
    state.outputData = null;
    state.isProcessing = false;
    state.messages = [{ role: 'system', text: 'Welcome back! Upload a new PDF to begin.' }];
    state.outputUI = {
      activeTab: 'summary',
      currentFlashcard: 0,
      isFlipped: false,
      selectedAnswers: {},
      showQuizResults: false
    };
    render();
  }

  function bindUI() {
    var navUpload = $('navUpload');
    var navReview = $('navReview');
    var resetBtn = $('resetBtn');
    var chatToggle = $('chatToggle');
    var chatClose = $('chatClose');
    var chatSend = $('chatSend');
    var chatInput = $('chatInput');

    if (navUpload) {
      navUpload.addEventListener('click', function () {
        state.step = 1;
        render();
      });
    }

    if (navReview) {
      navReview.addEventListener('click', function () {
        if (!state.outputData) return;
        state.step = 2;
        render();
      });
    }

    if (resetBtn) resetBtn.addEventListener('click', resetApp);

    if (chatToggle) {
      chatToggle.addEventListener('click', function (e) {
        e.preventDefault();
        setChatOpen(!state.chatOpen);
      });
    }

    if (chatClose) {
      chatClose.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setChatOpen(false);
        var panel = $('chatPanel');
        if (panel) panel.hidden = true;
      });
    }

    if (chatSend) {
      chatSend.addEventListener('click', function () {
        var input = $('chatInput');
        var text = input ? input.value : '';
        if (input) input.value = '';
        sendFeedback(text);
      });
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var text = chatInput.value;
          chatInput.value = '';
          sendFeedback(text);
        }
      });
    }
  }

  function init() {
    bindUI();
    render();

    // Backend health polling
    checkBackend();
    setInterval(checkBackend, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
