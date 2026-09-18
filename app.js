(() => {
  "use strict";

  /*
    Personal Finance Tracker

    Required files:
    index.html
    config.js
    app.js
    styles.css

    Required Supabase CDN in index.html:
    https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
  */

  // ---------------------------------------
  // CHECK SUPABASE
  // ---------------------------------------

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    alert(
      "Supabase was not loaded. Please check the Supabase script in index.html."
    );
    return;
  }

  if (
    !window.SUPABASE_URL ||
    !window.SUPABASE_PUBLISHABLE_KEY
  ) {
    alert(
      "Supabase settings are missing. Please check config.js."
    );
    return;
  }

  if (
    window.SUPABASE_URL.includes("YOUR_") ||
    window.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")
  ) {
    alert(
      "Please add your real Supabase URL and publishable key in config.js."
    );
    return;
  }

  const db = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY
  );

  // ---------------------------------------
  // APP STATE
  // ---------------------------------------

  let currentUser = null;
  let accounts = [];
  let cards = [];
  let transactions = [];

  const $ = (id) => document.getElementById(id);

  // ---------------------------------------
  // HELPERS
  // ---------------------------------------

  function money(amount) {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function monthStart() {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  }

  function showMessage(id, text) {
    const element = $(id);

    if (element) {
      element.textContent = text || "";
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return replacements[character];
    });
  }

  function openDialog(id) {
    const dialog = $(id);

    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }

  function closeDialog(id) {
    const dialog = $(id);

    if (dialog && typeof dialog.close === "function") {
      dialog.close();
    }
  }

  // ---------------------------------------
  // TABS
  // ---------------------------------------

  function showTab(tabName) {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle(
        "hidden",
        tab.id !== tabName
      );
    });

    document.querySelectorAll(".tabs button").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tabName
      );
    });
  }

  // ---------------------------------------
  // DATABASE LOADING
  // ---------------------------------------

  async function getRows(tableName) {
    const { data, error } = await db
      .from(tableName)
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error(
        `Error loading ${tableName}:`,
        error
      );

      showMessage(
        "authMessage",
        error.message
      );

      return [];
    }

    return data || [];
  }

  async function loadAll() {
    if (!currentUser) {
      return;
    }

    accounts = await getRows("accounts");
    cards = await getRows("credit_cards");
    transactions = await getRows("transactions");

    render();
  }

  // ---------------------------------------
  // BALANCE CALCULATIONS
  // ---------------------------------------

  function accountBalance(account) {
    const openingBalance = Number(
      account.opening_balance || 0
    );

    const income = transactions
      .filter((transaction) => {
        return (
          transaction.account_id === account.id &&
          transaction.type === "income"
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    const expenses = transactions
      .filter((transaction) => {
        return (
          transaction.account_id === account.id &&
          transaction.type === "expense"
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    const outgoingTransfers = transactions
      .filter((transaction) => {
        return (
          transaction.account_id === account.id &&
          [
            "transfer",
            "card_payment"
          ].includes(transaction.type)
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    const incomingTransfers = transactions
      .filter((transaction) => {
        return (
          transaction.to_account_id === account.id &&
          transaction.type === "transfer"
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    return (
      openingBalance +
      income -
      expenses -
      outgoingTransfers +
      incomingTransfers
    );
  }

  function cardOutstanding(card) {
    const openingOutstanding = Number(
      card.opening_outstanding || 0
    );

    const purchases = transactions
      .filter((transaction) => {
        return (
          transaction.to_card_id === card.id &&
          transaction.type === "expense"
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    const payments = transactions
      .filter((transaction) => {
        return (
          transaction.to_card_id === card.id &&
          transaction.type === "card_payment"
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    return (
      openingOutstanding +
      purchases -
      payments
    );
  }

  // ---------------------------------------
  // TABLE RENDERING
  // ---------------------------------------

  function createTransactionTable(
    rows,
    compact = false
  ) {
    if (!rows.length) {
      return "<p>No transactions yet.</p>";
    }

    const tableRows = rows
      .map((transaction) => {
        const isIncome =
          transaction.type === "income";

        const sign = isIncome ? "+" : "-";
        const amountClass = isIncome
          ? "income"
          : "expense";

        return `
          <tr>
            <td>
              ${escapeHTML(transaction.date)}
            </td>

            <td>
              ${escapeHTML(transaction.description)}
            </td>

            ${
              compact
                ? ""
                : `
                  <td>
                    ${escapeHTML(
                      transaction.category || ""
                    )}
                  </td>
                `
            }

            <td class="${amountClass}">
              ${sign}${money(transaction.amount)}
            </td>

            ${
              compact
                ? ""
                : `
                  <td>
                    ${escapeHTML(transaction.type)}
                  </td>
                `
            }
          </tr>
        `;
      })
      .join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>

            ${
              compact
                ? ""
                : "<th>Category</th>"
            }

            <th>Amount</th>

            ${
              compact
                ? ""
                : "<th>Type</th>"
            }
          </tr>
        </thead>

        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  }

  // ---------------------------------------
  // MAIN RENDER
  // ---------------------------------------

  function render() {
    const start = monthStart();

    const monthlyIncome = transactions
      .filter((transaction) => {
        return (
          transaction.type === "income" &&
          transaction.date >= start
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    const monthlyExpenses = transactions
      .filter((transaction) => {
        return (
          transaction.type === "expense" &&
          transaction.date >= start
        );
      })
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount || 0);
      }, 0);

    const totalBalance = accounts.reduce(
      (sum, account) => {
        return sum + accountBalance(account);
      },
      0
    );

    const totalCards = cards.reduce(
      (sum, card) => {
        return sum + cardOutstanding(card);
      },
      0
    );

    if ($("totalBalance")) {
      $("totalBalance").textContent =
        money(totalBalance);
    }

    if ($("totalCards")) {
      $("totalCards").textContent =
        money(totalCards);
    }

    if ($("monthIncome")) {
      $("monthIncome").textContent =
        money(monthlyIncome);
    }

    if ($("monthExpenses")) {
      $("monthExpenses").textContent =
        money(monthlyExpenses);
    }

    if ($("recentTransactions")) {
      $("recentTransactions").innerHTML =
        createTransactionTable(
          transactions.slice(0, 8),
          true
        );
    }

    if ($("allTransactions")) {
      $("allTransactions").innerHTML =
        createTransactionTable(
          transactions,
          false
        );
    }

    renderAccounts();
    renderCards();
    renderReports();
    fillAccountSelects();
  }

  function renderAccounts() {
    const element = $("accountsList");

    if (!element) {
      return;
    }

    element.innerHTML =
      accounts
        .map((account) => {
          return `
            <article class="account-card">
              <h3>
                ${escapeHTML(account.name)}
              </h3>

              <p>
                ${escapeHTML(account.type)}
              </p>

              <div class="balance">
                ${money(accountBalance(account))}
              </div>
            </article>
          `;
        })
        .join("") ||
      "<p>No accounts yet.</p>";
  }

  function renderCards() {
    const element = $("cardsList");

    if (!element) {
      return;
    }

    element.innerHTML =
      cards
        .map((card) => {
          return `
            <article class="account-card">
              <h3>
                ${escapeHTML(card.name)}
              </h3>

              <p>
                Credit limit:
                ${money(card.credit_limit)}
              </p>

              <div class="balance">
                ${money(cardOutstanding(card))}
              </div>

              <p>
                Due date:
                ${escapeHTML(card.due_date || "Not set")}
              </p>
            </article>
          `;
        })
        .join("") ||
      "<p>No credit cards yet.</p>";
  }

  function renderReports() {
    const reportTypes = [
      ["incomeReport", "income"],
      ["expenseReport", "expense"]
    ];

    reportTypes.forEach(([elementId, type]) => {
      const element = $(elementId);

      if (!element) {
        return;
      }

      const totals = {};

      transactions
        .filter((transaction) => {
          return transaction.type === type;
        })
        .forEach((transaction) => {
          const category =
            transaction.category ||
            "Uncategorised";

          totals[category] =
            (totals[category] || 0) +
            Number(transaction.amount || 0);
        });

      element.innerHTML =
        Object.entries(totals)
          .sort((a, b) => b[1] - a[1])
          .map(([category, amount]) => {
            return `
              <div>
                <span>
                  ${escapeHTML(category)}
                </span>

                <b>
                  ${money(amount)}
                </b>
              </div>
            `;
          })
          .join("") ||
        "<p>No data yet.</p>";
    });
  }

  // ---------------------------------------
  // SELECT OPTIONS
  // ---------------------------------------

  function fillAccountSelects() {
    const accountOptions = accounts
      .map((account) => {
        return `
          <option value="${account.id}">
            ${escapeHTML(account.name)}
          </option>
        `;
      })
      .join("");

    if ($("txAccount")) {
      $("txAccount").innerHTML = `
        <option value="">
          Select account
        </option>
        ${accountOptions}
      `;
    }

    if ($("txToAccount")) {
      const cardOptions = cards
        .map((card) => {
          return `
            <option value="card:${card.id}">
              ${escapeHTML(card.name)} card
            </option>
          `;
        })
        .join("");

      $("txToAccount").innerHTML = `
        <option value="">
          No destination
        </option>

        ${accountOptions}

        ${cardOptions}
      `;
    }
  }

  // ---------------------------------------
  // AUTHENTICATION
  // ---------------------------------------

  async function login() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      showMessage(
        "authMessage",
        "Enter your email and password."
      );
      return;
    }

    const { error } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      showMessage(
        "authMessage",
        error.message
      );
    } else {
      showMessage(
        "authMessage",
        ""
      );
    }
  }

  async function signup() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      showMessage(
        "authMessage",
        "Enter your email and password."
      );
      return;
    }

    if (password.length < 6) {
      showMessage(
        "authMessage",
        "Password must contain at least 6 characters."
      );
      return;
    }

    const { error } =
      await db.auth.signUp({
        email,
        password
      });

    if (error) {
      showMessage(
        "authMessage",
        error.message
      );
    } else {
      showMessage(
        "authMessage",
        "Account created. Check your email if confirmation is enabled."
      );
    }
  }

  // ---------------------------------------
  // SAVE ACCOUNT
  // ---------------------------------------

  async function saveAccount(event) {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const name = $("accountName").value.trim();
    const type = $("accountType").value;
    const openingBalance = Number(
      $("accountOpening").value
    );

    if (!name) {
      alert("Enter an account name.");
      return;
    }

    const { error } =
      await db.from("accounts").insert({
        user_id: currentUser.id,
        name,
        type,
        opening_balance: openingBalance
      });

    if (error) {
      alert(error.message);
      return;
    }

    closeDialog("accountDialog");
    $("accountForm").reset();

    await loadAll();
  }

  // ---------------------------------------
  // SAVE CREDIT CARD
  // ---------------------------------------

  async function saveCard(event) {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const name = $("cardName").value.trim();
    const creditLimit = Number(
      $("cardLimit").value
    );
    const openingOutstanding = Number(
      $("cardOpening").value
    );
    const dueDate = $("cardDue").value || null;

    if (!name) {
      alert("Enter a card name.");
      return;
    }

    const { error } =
      await db.from("credit_cards").insert({
        user_id: currentUser.id,
        name,
        credit_limit: creditLimit,
        opening_outstanding: openingOutstanding,
        due_date: dueDate
      });

    if (error) {
      alert(error.message);
      return;
    }

    closeDialog("cardDialog");
    $("cardForm").reset();

    await loadAll();
  }

  // ---------------------------------------
  // SAVE TRANSACTION
  // ---------------------------------------

  async function saveTransaction(event) {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    const type = $("txType").value;
    const destination = $("txToAccount").value;

    const transaction = {
      user_id: currentUser.id,
      type,
      date: $("txDate").value,
      description: $("txDescription").value.trim(),
      amount: Number($("txAmount").value),
      category:
        $("txCategory").value.trim() || null,
      note:
        $("txNote").value.trim() || null,
      account_id:
        $("txAccount").value || null,
      to_account_id: null,
      to_card_id: null
    };

    if (
      !transaction.description ||
      !transaction.amount ||
      transaction.amount <= 0
    ) {
      showMessage(
        "txMessage",
        "Enter a valid description and amount."
      );
      return;
    }

    if (type === "transfer") {
      if (!destination) {
        showMessage(
          "txMessage",
          "Select a destination account."
        );
        return;
      }

      if (destination.startsWith("card:")) {
        showMessage(
          "txMessage",
          "Transfers can only go to another bank account."
        );
        return;
      }

      transaction.to_account_id =
        destination;
    }

    if (type === "card_payment") {
      if (!destination) {
        showMessage(
          "txMessage",
          "Select the credit card being paid."
        );
        return;
      }

      if (!destination.startsWith("card:")) {
        showMessage(
          "txMessage",
          "Select a credit card as the destination."
        );
        return;
      }

      transaction.to_card_id =
        destination.replace("card:", "");
    }

    const { error } =
      await db
        .from("transactions")
        .insert(transaction);

    if (error) {
      showMessage(
        "txMessage",
        error.message
      );
      return;
    }

    closeDialog("transactionDialog");
    $("transactionForm").reset();

    await loadAll();
  }

  // ---------------------------------------
  // OPEN TRANSACTION FORM
  // ---------------------------------------

  function openTransactionForm() {
    $("transactionForm").reset();

    $("txDate").value = today();

    $("txToAccount").disabled = true;

    showMessage("txMessage", "");

    openDialog("transactionDialog");
  }

  // ---------------------------------------
  // EVENT LISTENERS
  // ---------------------------------------

  function bindEvents() {
    $("loginBtn")?.addEventListener(
      "click",
      login
    );

    $("signupBtn")?.addEventListener(
      "click",
      signup
    );

    $("logoutBtn")?.addEventListener(
      "click",
      async () => {
        await db.auth.signOut();
      }
    );

    document
      .querySelectorAll(".tabs button")
      .forEach((button) => {
        button.addEventListener("click", () => {
          showTab(button.dataset.tab);
        });
      });

    $("quickAdd")?.addEventListener(
      "click",
      openTransactionForm
    );

    $("addTransactionBtn")?.addEventListener(
      "click",
      openTransactionForm
    );

    $("addTransactionBtnTransactions")?.addEventListener(
      "click",
      openTransactionForm
    );

    $("addAccountBtn")?.addEventListener(
      "click",
      () => {
        $("accountForm").reset();
        openDialog("accountDialog");
      }
    );

    $("addCardBtn")?.addEventListener(
      "click",
      () => {
        $("cardForm").reset();
        openDialog("cardDialog");
      }
    );

    $("txType")?.addEventListener(
      "change",
      () => {
        const type = $("txType").value;

        $("txToAccount").disabled =
          ![
            "transfer",
            "card_payment"
          ].includes(type);
      }
    );

    $("accountForm")?.addEventListener(
      "submit",
      saveAccount
    );

    $("cardForm")?.addEventListener(
      "submit",
      saveCard
    );

    $("transactionForm")?.addEventListener(
      "submit",
      saveTransaction
    );
  }

  // ---------------------------------------
  // SCREEN STATE
  // ---------------------------------------

  function updateScreen(session) {
    currentUser = session?.user || null;

    $("authView")?.classList.toggle(
      "hidden",
      Boolean(currentUser)
    );

    $("appView")?.classList.toggle(
      "hidden",
      !currentUser
    );

    $("logoutBtn")?.classList.toggle(
      "hidden",
      !currentUser
    );

    if (currentUser) {
      loadAll();
    }
  }

  // ---------------------------------------
  // START APP
  // ---------------------------------------

  bindEvents();

  db.auth
    .getSession()
    .then(({ data }) => {
      updateScreen(data.session);
    });

  db.auth.onAuthStateChange(
    (_event, session) => {
      updateScreen(session);
    }
  );
})();
