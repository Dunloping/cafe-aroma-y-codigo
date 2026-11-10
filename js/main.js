/**
 * Café Aroma & Código — interactions
 * Progressive enhancement: the page is fully readable without this file.
 */
(function () {
  "use strict";

  var root = document.documentElement;

  // Signals that JS is available, so CSS can enable the collapsible mobile menu.
  root.classList.add("js");

  var header = document.querySelector(".header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector("#primary-nav");
  var mobileQuery = window.matchMedia("(max-width: 819px)");

  /* ---------------------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------------------- */
  function setNav(open) {
    if (!toggle || !nav) return;

    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Cerrar menú de navegación" : "Abrir menú de navegación"
    );
  }

  function closeNav() {
    setNav(false);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setNav(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a") && mobileQuery.matches) {
        closeNav();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeNav();
      }
    });

    // Reset the panel when resizing back to the desktop layout.
    mobileQuery.addEventListener("change", function (event) {
      if (!event.matches) closeNav();
    });
  }

  /* ---------------------------------------------------------------------
     Header elevation on scroll
     --------------------------------------------------------------------- */
  if (header) {
    var updateHeader = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  /* ---------------------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------------------- */
  var reveals = document.querySelectorAll(".reveal");
  var prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (reveals.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    root.classList.add("reveal-on");

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
    );

    reveals.forEach(function (item) {
      observer.observe(item);
    });
  }

  /* ---------------------------------------------------------------------
     Contact form — posts to /api/contact (Vercel function + PostgreSQL)
     --------------------------------------------------------------------- */
  var form = document.querySelector("#contact-form");
  var feedback = document.querySelector("#form-feedback");

  function setFeedback(state, message) {
    if (!feedback) return;
    feedback.dataset.state = state;
    feedback.textContent = message;
  }

  if (form && feedback) {
    var submitButton = form.querySelector('button[type="submit"]');
    var submitLabel = submitButton ? submitButton.textContent : "";

    var params = new URLSearchParams(window.location.search);
    if (params.get("enviado") === "1") {
      setFeedback(
        "success",
        "¡Gracias! Recibimos tu mensaje y te responderemos a la brevedad."
      );
    } else if (params.get("error") === "1") {
      setFeedback(
        "error",
        "No pudimos guardar tu mensaje. Intentá de nuevo en unos minutos."
      );
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var payload = {};
      new FormData(form).forEach(function (value, key) {
        payload[key] = value;
      });

      setFeedback("", "");
      form.setAttribute("aria-busy", "true");
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Enviando…";
      }

      fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var firstFieldError =
              result.body && result.body.fields
                ? Object.values(result.body.fields)[0]
                : null;
            throw new Error(
              firstFieldError ||
                (result.body && result.body.message) ||
                "No pudimos enviar el mensaje. Intentá de nuevo."
            );
          }

          var id = result.body && result.body.id;
          form.reset();
          setFeedback(
            "success",
            "¡Gracias! Recibimos tu mensaje" +
              (id ? " (N.º " + id + ")" : "") +
              ". Te responderemos a la brevedad."
          );
        })
        .catch(function (error) {
          setFeedback(
            "error",
            error instanceof TypeError
              ? "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo."
              : error.message
          );
        })
        .finally(function () {
          form.removeAttribute("aria-busy");
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = submitLabel;
          }
        });
    });
  }

  /* ---------------------------------------------------------------------
     Footer year
     --------------------------------------------------------------------- */
  var year = document.querySelector("#year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
})();
