document.addEventListener("DOMContentLoaded", () => {
  let currentUser = null;
  const byId = id => document.getElementById(id);
  const categoryNames = {
    academics: "Academics",
    campus: "College life",
    career: "Career",
    projects: "Projects",
    web: "Web development",
    ai: "AI & technology",
    design: "Design",
    social: "Social impact"
  };

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }

  function setMessage(target, text, isError) {
    if (!target) return;
    target.textContent = text;
    target.classList.toggle("message-error", Boolean(isError));
  }

  function showBanner(text) {
    const shell = document.querySelector(".page-shell");
    if (!shell) return;
    let banner = byId("appStatus");
    if (!banner) {
      banner = node("p", "app-status form-message message-error");
      banner.id = "appStatus";
      shell.prepend(banner);
    }
    setMessage(banner, text, true);
  }

  async function api(path, options) {
    const settings = options || {};
    const headers = Object.assign({}, settings.headers || {});
    if (settings.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(path, Object.assign({}, settings, {
      credentials: "same-origin",
      headers
    }));
    const payload = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : {};
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  function updateNavigation() {
    const nav = document.querySelector(".main-nav");
    if (!nav) return;
    nav.querySelectorAll('a[href="login.html"], a[href="register.html"]').forEach(link => {
      link.classList.toggle("hidden", Boolean(currentUser));
    });
    nav.querySelector(".account-controls")?.remove();
    if (!currentUser) return;

    const controls = node("div", "account-controls");
    controls.append(node("span", "nav-account-name", currentUser.name));
    const logout = node("button", "nav-logout", "Log out");
    logout.type = "button";
    logout.addEventListener("click", async () => {
      try {
        await api("/api/auth/logout", { method: "POST" });
        window.location.href = "/index.html";
      } catch (error) {
        showBanner(error.message);
      }
    });
    controls.append(logout);
    nav.append(controls);
  }

  function bindMobileNavigation() {
    const menuButton = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".main-nav");
    if (!menuButton || !nav) return;
    menuButton.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(isOpen));
    });
  }

  function formatDate(value) {
    if (!value) return "Just now";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Just now" : parsed.toLocaleDateString();
  }

  function buildQuestionCard(question) {
    const card = node("article", "question-card");
    const top = node("div", "question-top");
    top.append(
      node("span", "pill pill-blue", categoryNames[question.category] || question.category),
      node("span", `status status-${question.status}`, question.status === "answered" ? "Answered" : "Open")
    );
    card.append(top, node("h3", "", question.title), node("p", "", question.body));
    const meta = node("div", "question-meta");
    const count = question.answer_count || 0;
    meta.append(
      node("span", "", `Posted ${formatDate(question.created_at)}`),
      node("span", "", `${count} ${count === 1 ? "response" : "responses"}`),
      node("span", "", `Asked by ${question.author}`)
    );
    const open = node("button", "button button-primary question-open", "Open discussion →");
    open.type = "button";
    open.dataset.questionId = question.id;
    card.append(meta, open);
    return card;
  }

  async function loadQuestions() {
    const list = byId("questionList");
    if (!list) return;
    const params = new URLSearchParams();
    const search = byId("questionSearch");
    const category = byId("questionCategory");
    const status = byId("questionStatus");
    if (search?.value.trim()) params.set("search", search.value.trim());
    if (category?.value && category.value !== "all") params.set("category", category.value);
    if (status?.value && status.value !== "all") params.set("status", status.value);
    list.replaceChildren(node("p", "empty-state", "Loading community questions…"));
    try {
      const result = await api(`/api/questions?${params.toString()}`);
      list.replaceChildren();
      if (!result.questions.length) {
        list.append(node("p", "empty-state", "No questions match these filters yet. Be the first to start a discussion."));
        return;
      }
      result.questions.forEach(question => list.append(buildQuestionCard(question)));
    } catch (error) {
      list.replaceChildren(node("p", "empty-state message-error", error.message));
    }
  }

  function renderAnswer(answer) {
    const item = node("article", "answer-card");
    item.append(
      node("p", "answer-body", answer.body),
      node("div", "question-meta", `${answer.author} · ${formatDate(answer.created_at)}`)
    );
    return item;
  }

  async function showQuestion(questionId) {
    const detail = byId("questionDetail");
    if (!detail) return;
    detail.classList.remove("hidden");
    detail.replaceChildren(node("p", "empty-state", "Loading discussion…"));
    try {
      const result = await api(`/api/questions/${encodeURIComponent(questionId)}`);
      const question = result.question;
      detail.replaceChildren();
      const heading = node("div", "section-title-row");
      const headingContent = node("div");
      headingContent.append(
        node("p", "eyebrow", "COMMUNITY DISCUSSION"),
        node("h2", "", question.title)
      );
      const close = node("button", "button button-light", "Close");
      close.type = "button";
      close.addEventListener("click", () => detail.classList.add("hidden"));
      heading.append(headingContent, close);
      detail.append(heading, node("p", "question-detail-body", question.body));
      detail.append(node("p", "question-meta", `Asked by ${question.author} · ${formatDate(question.created_at)}`));
      const responses = node("div", "answer-list");
      responses.append(node("h3", "", `Responses (${result.answers.length})`));
      if (result.answers.length) {
        result.answers.forEach(answer => responses.append(renderAnswer(answer)));
      } else {
        responses.append(node("p", "muted", "No responses yet."));
      }
      detail.append(responses);

      if (currentUser?.role === "senior") {
        const form = node("form", "community-form answer-form");
        form.innerHTML = '<label class="field"><span>Your response</span><textarea name="body" rows="4" maxlength="5000" required placeholder="Share your experience or advice."></textarea></label><button class="button button-primary" type="submit">Post response →</button><p class="form-message" role="status"></p>';
        form.addEventListener("submit", async event => {
          event.preventDefault();
          const message = form.querySelector(".form-message");
          try {
            await api(`/api/questions/${encodeURIComponent(questionId)}/answers`, {
              method: "POST",
              body: JSON.stringify({ body: form.elements.body.value })
            });
            await showQuestion(questionId);
            await loadQuestions();
          } catch (error) {
            setMessage(message, error.message, true);
          }
        });
        detail.append(form);
      } else if (currentUser) {
        detail.append(node("p", "muted", "Senior accounts can add responses to this discussion."));
      } else {
        const login = node("a", "text-link", "Log in to join the conversation →");
        login.href = `login.html?next=${encodeURIComponent("/ask-seniors.html")}`;
        detail.append(login);
      }
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      detail.replaceChildren(node("p", "empty-state message-error", error.message));
    }
  }

  function bindQuestionPage() {
    const search = byId("questionSearch");
    const category = byId("questionCategory");
    const status = byId("questionStatus");
    if (!byId("questionList")) return;
    let timer;
    const scheduleLoad = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(loadQuestions, 250);
    };
    search?.addEventListener("input", scheduleLoad);
    category?.addEventListener("change", loadQuestions);
    status?.addEventListener("change", loadQuestions);
    byId("filterQuestions")?.addEventListener("click", loadQuestions);
    byId("questionList").addEventListener("click", event => {
      const button = event.target.closest("[data-question-id]");
      if (button) showQuestion(button.dataset.questionId);
    });
    byId("questionForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = byId("questionMessage");
      setMessage(message, "Posting your question…", false);
      try {
        await api("/api/questions", {
          method: "POST",
          body: JSON.stringify({
            title: byId("questionTitle").value,
            body: byId("questionBody").value,
            category: byId("newQuestionCategory").value
          })
        });
        form.reset();
        setMessage(message, "Your question has been posted.", false);
        await loadQuestions();
      } catch (error) {
        setMessage(message, error.message, true);
      }
    });
    loadQuestions();
  }

  function seniorMatches(senior, term, department, topic) {
    const profileText = [senior.name, senior.department, senior.bio, ...(senior.topics || [])]
      .join(" ").toLowerCase();
    if (term && !profileText.includes(term)) return false;
    const departmentMap = {
      cse: "Computer Science and Engineering",
      ise: "Information Science and Engineering",
      ece: "Electronics and Communication",
      me: "Mechanical Engineering",
      eee: "Electrical and Electronics"
    };
    if (department !== "all" && senior.department !== departmentMap[department]) return false;
    const topicMap = {
      software: ["software", "coding", "programming", "web"],
      data: ["data", "ai", "machine learning"],
      design: ["design", "product"],
      career: ["career", "internship", "job"]
    };
    if (topic !== "all") {
      const interests = (senior.topics || []).join(" ").toLowerCase();
      if (!topicMap[topic]?.some(value => interests.includes(value))) return false;
    }
    return true;
  }

  async function loadSeniors() {
    const grid = byId("seniorGrid");
    if (!grid) return;
    try {
      const result = await api("/api/seniors");
      const search = byId("seniorSearch");
      const department = byId("seniorDepartment");
      const topic = byId("seniorTopic");
      const render = () => {
        const matches = result.seniors.filter(senior =>
          seniorMatches(senior, search.value.trim().toLowerCase(), department.value, topic.value)
        );
        grid.replaceChildren();
        const resultCount = byId("seniorResultCount");
        if (resultCount) resultCount.textContent = `${matches.length} ${matches.length === 1 ? "senior" : "seniors"} found`;
        const seniorCount = byId("seniorCount");
        if (seniorCount) seniorCount.textContent = String(result.seniors.length).padStart(2, "0");
        if (!matches.length) {
          grid.append(node("p", "empty-state", result.seniors.length
            ? "No profiles match those filters. Try a different search or department."
            : "No senior profiles yet. Register as a senior to share your experience."));
          return;
        }
        matches.forEach(senior => {
          const card = node("article", "senior-card");
          const top = node("div", "senior-card-top");
          const initials = senior.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
          const avatar = node("div", "senior-avatar avatar-blue", initials);
          avatar.setAttribute("aria-hidden", "true");
          const info = node("div", "senior-name");
          info.append(node("h3", "", senior.name), node("p", "", `${senior.department} · ${senior.year}`));
          top.append(avatar, info);
          const body = node("div", "senior-card-body");
          body.append(node("p", "", senior.bio || "Available to share advice and experience with fellow students."));
          if (senior.topics.length) {
            const tags = node("div", "senior-tags");
            senior.topics.forEach(value => tags.append(node("span", "pill pill-blue", value)));
            body.append(tags);
          }
          body.append(node("div", "senior-details", "Open to questions"));
          const ask = node("a", "button button-primary senior-action", "Ask a question →");
          ask.href = "ask-seniors.html#ask-form";
          body.append(ask);
          card.append(top, body);
          grid.append(card);
        });
      };
      search.addEventListener("input", render);
      department.addEventListener("change", render);
      topic.addEventListener("change", render);
      render();
    } catch (error) {
      grid.replaceChildren(node("p", "empty-state message-error", error.message));
    }
  }

  async function loadProjects() {
    const grid = byId("projectGrid");
    if (!grid) return;
    const params = new URLSearchParams();
    const filter = byId("projectCategory");
    if (filter?.value && filter.value !== "all") params.set("category", filter.value);
    grid.replaceChildren(node("p", "empty-state", "Loading student projects…"));
    try {
      const result = await api(`/api/projects?${params.toString()}`);
      grid.replaceChildren();
      if (!result.projects.length) {
        grid.append(node("p", "empty-state", "No projects in this category yet. Share the first one."));
        return;
      }
      result.projects.forEach((project, index) => {
        const card = node("article", "content-card project-card");
        const visual = node("div", `project-visual visual-${project.category}`);
        visual.append(node("span", "", String(index + 1).padStart(2, "0")));
        visual.append(node("b", "", (categoryNames[project.category] || project.category).toUpperCase()));
        card.append(visual);
        const content = node("div", "project-card-body");
        const tags = node("div", "card-tags");
        tags.append(node("span", "pill pill-blue", categoryNames[project.category] || project.category));
        content.append(tags, node("h3", "", project.title), node("p", "", project.description));
        const footer = node("div", "project-footer");
        footer.append(node("span", "", `${project.author} · ${formatDate(project.created_at)}`));
        if (project.url) {
          const link = node("a", "text-link", "View project ↗");
          link.href = project.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          footer.append(link);
        }
        content.append(footer);
        card.append(content);
        grid.append(card);
      });
    } catch (error) {
      grid.replaceChildren(node("p", "empty-state message-error", error.message));
    }
  }

  function bindProjectPage() {
    byId("projectCategory")?.addEventListener("change", loadProjects);
    if (!byId("projectGrid")) return;
    loadProjects();
    byId("projectForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = byId("projectMessage");
      setMessage(message, "Publishing your project…", false);
      try {
        await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            title: byId("projectTitle").value,
            description: byId("projectDescription").value,
            category: byId("newProjectCategory").value,
            url: byId("projectUrl").value
          })
        });
        form.reset();
        setMessage(message, "Your project has been published.", false);
        await loadProjects();
      } catch (error) {
        setMessage(message, error.message, true);
      }
    });
  }

  function bindAuthenticationForms() {
    byId("loginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const message = byId("loginMessage");
      setMessage(message, "Signing in…", false);
      try {
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: byId("email").value,
            password: byId("password").value
          })
        });
        const next = new URLSearchParams(window.location.search).get("next");
        if (next && next.startsWith("/") && !next.startsWith("//")) {
          const nextUrl = new URL(next, window.location.origin);
          window.location.href = nextUrl.origin === window.location.origin
            ? `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
            : "/index.html";
        } else {
          window.location.href = "/index.html";
        }
      } catch (error) {
        setMessage(message, error.message, true);
      }
    });

    byId("registerForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = byId("registerMessage");
      const password = byId("password").value;
      if (password !== byId("confirmPassword").value) {
        setMessage(message, "Passwords do not match.", true);
        return;
      }
      setMessage(message, "Creating your account…", false);
      try {
        const topics = byId("topics").value.split(",").map(value => value.trim()).filter(Boolean);
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: byId("fullName").value,
            email: byId("email").value,
            role: byId("role").value,
            department: byId("department").value,
            year: byId("year").value,
            password,
            bio: byId("bio").value,
            topics
          })
        });
        window.location.href = "/index.html";
      } catch (error) {
        setMessage(message, error.message, true);
      }
    });
  }

  async function initialize() {
    bindMobileNavigation();
    bindQuestionPage();
    bindProjectPage();
    bindAuthenticationForms();
    try {
      const result = await api("/api/me");
      currentUser = result.user;
      updateNavigation();
    } catch (error) {
      showBanner(error.message);
    }
    loadSeniors();
  }

  initialize();
});
