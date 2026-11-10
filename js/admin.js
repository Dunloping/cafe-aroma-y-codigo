/**
 * Café Aroma & Código — Admin panel
 * Talks to /api/admin/* with the HttpOnly session cookie.
 */
(function () {
  "use strict";

  var loginView = document.querySelector("#login-view");
  var panelView = document.querySelector("#panel-view");
  var boot = document.querySelector("#boot");
  var logoutButton = document.querySelector("#logout");
  var loginForm = document.querySelector("#login-form");
  var loginFeedback = document.querySelector("#login-feedback");
  var loginSubmit = document.querySelector("#login-submit");
  var loginTitle = document.querySelector("#login-title");
  var passwordInput = document.querySelector("#password");
  var panelTitle = document.querySelector("#panel-title");
  var refreshButton = document.querySelector("#refresh");
  var filtersForm = document.querySelector("#filters");
  var messagesList = document.querySelector("#messages");
  var emptyState = document.querySelector("#empty");
  var panelStatus = document.querySelector("#panel-status");

  var statEls = {
    total: document.querySelector("#stat-total"),
    nuevo: document.querySelector("#stat-nuevo"),
    leido: document.querySelector("#stat-leido"),
    respondido: document.querySelector("#stat-respondido"),
  };

  var ESTADO_LABEL = {
    nuevo: "Nuevo",
    leido: "Leído",
    respondido: "Respondido",
  };

  var MOTIVO_LABEL = {
    reserva: "Reserva",
    consulta: "Consulta",
    sugerencia: "Sugerencia",
  };

  var dateFormatter = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  var busy = false;

  /* ------------------------------------------------------------ helpers */
  function request(path, options) {
    options = options || {};
    var headers = { Accept: "application/json" };
    if (options.body) headers["Content-Type"] = "application/json";

    return fetch(path, {
      method: options.method || "GET",
      headers: headers,
      credentials: "same-origin",
      body: options.body,
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
    });
  }

  function setFeedback(element, state, message) {
    if (!element) return;
    element.dataset.state = state;
    element.textContent = message;
  }

  function formatDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
  }

  function showLogin(message) {
    boot.hidden = true;
    loginView.hidden = false;
    panelView.hidden = true;
    logoutButton.hidden = true;
    if (message) setFeedback(loginFeedback, "error", message);
  }

  function showPanel() {
    boot.hidden = true;
    loginView.hidden = true;
    panelView.hidden = false;
    logoutButton.hidden = false;
  }

  /* -------------------------------------------------------------- render */
  function render(data) {
    var stats = data.stats || {};
    Object.keys(statEls).forEach(function (key) {
      statEls[key].textContent = String(stats[key] || 0);
    });

    messagesList.textContent = "";
    var items = data.items || [];
    items.forEach(function (item) {
      messagesList.appendChild(buildMessage(item));
    });
    emptyState.hidden = items.length > 0;
  }

  function buildMessage(item) {
    var li = document.createElement("li");
    li.className = "admin-message";

    var head = document.createElement("div");
    head.className = "admin-message__head";

    var badge = document.createElement("span");
    badge.className = "badge badge--" + item.estado;
    badge.textContent = ESTADO_LABEL[item.estado] || item.estado;

    var name = document.createElement("strong");
    name.textContent = item.nombre;

    var time = document.createElement("time");
    time.className = "admin-message__time";
    time.dateTime = item.creado_en;
    time.textContent = formatDate(item.creado_en);

    head.append(badge, name, time);

    var meta = document.createElement("p");
    meta.className = "admin-message__meta";
    meta.textContent = [
      MOTIVO_LABEL[item.motivo] || item.motivo,
      item.correo,
      item.telefono,
    ]
      .filter(Boolean)
      .join(" · ");

    var body = document.createElement("p");
    body.className = "admin-message__body";
    body.textContent = item.mensaje;

    var actions = document.createElement("div");
    actions.className = "admin-message__actions";

    var mail = document.createElement("a");
    mail.className = "admin-message__mail";
    mail.href =
      "mailto:" +
      item.correo +
      "?subject=" +
      encodeURIComponent("Re: tu mensaje a Aroma & Código");
    mail.textContent = "Responder por correo";
    actions.appendChild(mail);

    actionsFor(item).forEach(function (action) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn--ghost";
      button.dataset.id = String(item.id);
      button.dataset.estado = action.estado;
      button.textContent = action.label;
      button.setAttribute(
        "aria-label",
        action.label + " el mensaje de " + item.nombre
      );
      actions.appendChild(button);
    });

    li.append(head, meta, body, actions);
    return li;
  }

  function actionsFor(item) {
    if (item.estado === "nuevo") {
      return [
        { label: "Marcar leído", estado: "leido" },
        { label: "Marcar respondido", estado: "respondido" },
      ];
    }

    if (item.estado === "leido") {
      return [
        { label: "Marcar respondido", estado: "respondido" },
        { label: "Reabrir", estado: "nuevo" },
      ];
    }

    return [
      { label: "Marcar leído", estado: "leido" },
      { label: "Reabrir", estado: "nuevo" },
    ];
  }

  /* --------------------------------------------------------------- data */
  function currentFilters() {
    var data = new FormData(filtersForm);
    var params = new URLSearchParams();

    ["estado", "motivo", "q"].forEach(function (key) {
      var value = String(data.get(key) || "").trim();
      if (value) params.set(key, value);
    });

    return params;
  }

  function loadMessages(message) {
    var query = currentFilters().toString();
    var url = "/api/admin/messages" + (query ? "?" + query : "");

    return request(url)
      .then(function (result) {
        if (result.status === 401) {
          showLogin("Tu sesión expiró. Volvé a iniciar sesión.");
          return;
        }

        if (!result.ok) {
          throw new Error(
            (result.body && result.body.message) ||
              "No pudimos cargar los mensajes."
          );
        }

        render(result.body);
        panelStatus.textContent =
          message ||
          (result.body.items.length
            ? "Mostrando " +
              result.body.items.length +
              (result.body.items.length === 1 ? " mensaje." : " mensajes.")
            : "");
      })
      .catch(function (error) {
        panelStatus.textContent =
          error instanceof TypeError
            ? "No pudimos conectar con el servidor."
            : error.message;
      });
  }

  function updateEstado(id, estado, button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    panelStatus.textContent = "Actualizando…";

    request("/api/admin/messages", {
      method: "PATCH",
      body: JSON.stringify({ id: Number(id), estado: estado }),
    })
      .then(function (result) {
        if (result.status === 401) {
          showLogin("Tu sesión expiró. Volvé a iniciar sesión.");
          return;
        }

        if (!result.ok) {
          throw new Error(
            (result.body && result.body.message) ||
              "No pudimos actualizar el mensaje."
          );
        }

        return loadMessages("Mensaje actualizado.");
      })
      .catch(function (error) {
        panelStatus.textContent =
          error instanceof TypeError
            ? "No pudimos conectar con el servidor."
            : error.message;
      })
      .finally(function () {
        busy = false;
        button.disabled = false;
      });
  }

  /* ------------------------------------------------------------- events */
  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!loginForm.checkValidity()) {
      loginForm.reportValidity();
      return;
    }

    setFeedback(loginFeedback, "", "");
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Verificando…";

    request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value }),
    })
      .then(function (result) {
        if (!result.ok) {
          setFeedback(
            loginFeedback,
            "error",
            (result.body && result.body.message) ||
              "No pudimos validar la contraseña."
          );
          passwordInput.select();
          return;
        }

        loginForm.reset();
        return loadMessages().then(function () {
          showPanel();
          panelTitle.focus();
        });
      })
      .catch(function () {
        setFeedback(
          loginFeedback,
          "error",
          "No pudimos conectar con el servidor. Intentá de nuevo."
        );
      })
      .finally(function () {
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Entrar";
      });
  });

  logoutButton.addEventListener("click", function () {
    logoutButton.disabled = true;

    request("/api/admin/logout", { method: "POST" })
      .catch(function () {
        /* the cookie is cleared client-side by the page state anyway */
      })
      .finally(function () {
        logoutButton.disabled = false;
        messagesList.textContent = "";
        panelStatus.textContent = "";
        setFeedback(loginFeedback, "", "");
        passwordInput.value = "";
        showLogin("");
        loginTitle.focus();
      });
  });

  refreshButton.addEventListener("click", function () {
    loadMessages("Lista actualizada.");
  });

  filtersForm.addEventListener("submit", function (event) {
    event.preventDefault();
    loadMessages();
  });

  filtersForm.addEventListener("reset", function () {
    window.setTimeout(function () {
      loadMessages("Filtros restablecidos.");
    }, 0);
  });

  messagesList.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-estado]");
    if (!button) return;
    updateEstado(button.dataset.id, button.dataset.estado, button);
  });

  /* --------------------------------------------------------------- boot */
  request("/api/admin/messages")
    .then(function (result) {
      if (result.ok) {
        render(result.body);
        showPanel();
        return;
      }

      if (result.status === 401) {
        showLogin("");
      } else {
        showLogin(
          (result.body && result.body.message) ||
            "No pudimos verificar la sesión."
        );
      }
      passwordInput.focus();
    })
    .catch(function () {
      showLogin("No pudimos conectar con el servidor. Intentá de nuevo.");
      passwordInput.focus();
    });
})();
