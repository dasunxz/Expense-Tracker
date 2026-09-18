(() => {
  "use strict";

  if (!window.supabase) {
    alert("Supabase library is not loaded. Please check index.html.");
    return;
  }

  if (
    !window.SUPABASE_URL ||
    !window.SUPABASE_PUBLISHABLE_KEY ||
    window.SUPABASE_URL.includes("YOUR_") ||
    window.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")
  ) {
    alert("Please check your Supabase details in config.js.");
    return;
  }

  const db = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY
  );

  let currentUser = null;
  let accounts = [];
  let cards = [];
  let transactions = [];

  const $ = (id) => document.getElementById(id);

  const money = (amount) =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);

  const today = () => new Date().toISOString().slice(0, 10);

  const monthStart = () => `${today().slice(0, 8)}01`;

  function showMessage(id, text) {
    const element = $(id);
    if (element) element.textContent = text || "";
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

  function showTab(tabName) {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("hidden", tab.id !== tabName);
    });

    document.querySelectorAll(".tabs button").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tabName
      );
    });
  }

  function openDialog(id) {
    const dialog = $(id);

    if (dialog && dialog.showModal) {
      dialog.showModal();
    }
  }

  function closeDialog(id) {
    const dialog = $(id);

    if (dialog && dialog.close) {
      dialog.close();
    }
  }

  async function getRows(tableName) {
    const { data, error } = await db
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Error loading ${tableName}:`, error);
      showMessage("authMessage", error.message);
      return [];
    }

    return data || [];
  }

  async function loadAll() {
    if (!currentUser) return;

    accounts = await getRows("accounts");
    cards = await getRows("credit_cards");
    transactions = await getRows("transactions");

    render();
  }

  function accountBalance(account) {
    const openingBalance = Number(account.opening_balance || 0);

    const income = transactions
      .filter(
        (tx) =>
          tx.account_id === account.id &&
          tx.type === "income"
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const expenses = transactions
      .filter(
        (tx) =>
          tx.account_id === account.id &&
          tx.type === "expense"
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const outgoingTransfers = transactions
      .filter(
        (tx) =>
          tx.account_id === account.id &&
          ["transfer", "card_payment"].includes(tx.type)
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const incomingTransfers = transactions
      .filter(
        (tx) =>
          tx.to_account_id === account.id &&
          tx.type === "transfer"
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

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
      .filter(
        (tx) =>
          tx.to_card_id === card.id &&
          tx.type === "expense"
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const payments = transactions
      .filter(
        (tx) =>
          tx.to_card_id === card.id &&
          tx.type === "card_payment"
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return openingOutstanding + purchases - payments;
  }

  function createTransactionTable(rows, compact = false) {
    if (!rows.length) {
      return "<p>No transactions yet.</p>";
    }

    const tableRows = rows
      .map((tx) => {
        const isIncome = tx.type === "income";
        const sign = isIncome ? "+" : "-";
        const amountClass = isIncome ? "income" : "expense";

        return `
          <tr>
            <td>${escapeHTML(tx.date)}</td>
            <td>${escapeHTML(tx.description)}</td>
            ${
              compact
                ? ""
                : `<td>${escapeHTML(tx.category || "")}</td>`
            }
            <td class="${amountClass}">
              ${sign}${money(tx.amount)}
            </td>
            ${
              compact
                ? ""
                : `<td>${escapeHTML(tx.type)}</td>`
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
            ${compact ? "" : "<th>Category</th>"}
            <th>Amount</th>
            ${compact ? "" : "<th>Type</th>"}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  }

  function render() {
    const start = monthStart();

    const monthlyIncome = transactions
      .filter(
        (tx) =>
          tx.type === "income" &&
          tx.date >= start
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const monthlyExpenses = transactions
      .filter(
        (tx) =>
          tx.type === "expense" &&
          tx.date >= start
      )
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    $("totalBalance").textContent = money(
      accounts.reduce(
        (sum, account) => sum + accountBalance(account),
        0
      )
    );

    $("totalCards").textContent = money(
      cards.reduce(
        (sum, card) => sum + cardOutstanding(card),
        0
      )
    );

    $("monthIncome").textContent = money(monthlyIncome);
    $("monthExpenses").textContent = money(monthlyExpenses);

    $("recentTransactions").innerHTML =
      createTransactionTable(
        transactions.slice(0, 8),
        true
      );

    $("allTransactions").innerHTML =
      createTransactionTable(transactions);

    $("accountsList").innerHTML =
      accounts
        .map(
          (account) => `
            <article class="account-card">
              <h3>${escapeHTML(account.name)}</h3>
              <p>${escapeHTML(account.type)}</p>
              <div class="balance">
                ${money(accountBalance(account))}
              </div>
            </article>
          `
        )
        .join("") || "<p>No accounts yet.</p>";

    $("cardsList").innerHTML =
      cards
        .map(
          (card) => `
            <article class="account-card">
              <h3>${escapeHTML(card.name)}</h3>
              <p>Limit: ${money(card.credit_limit)}</p>
              <div class="balance">
                ${money(cardOutstanding(card))}
              </div>
              <p>
                Due: ${card.due_date || "Not set"}
              </p>
            </article>
          `
        )
        .join("") || "<p>No credit cards yet.</p>";

    renderReports();
    fillAccountSelects();
  }

  function renderReports() {
    const reportTypes = [
      ["incomeReport", "income"],
      ["expenseReport", "expense"]
    ];

    reportTypes.forEach(([elementId, type]) => {
      const totals = {};

      transactions
        .filter((tx) => tx.type === type)
        .forEach((tx) => {
          const category = tx.category || "Uncategorised";

          totals[category] =
            (totals[category] || 0) +
            Number(tx.amount || 0);
        });

      $(elementId).innerHTML =
        Object.entries(totals)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([category, amount]) => `
              <div>
                <span>${escapeHTML(category)}</span>
                <b>${money(amount)}</b>
              </div>
            `
          )
          .join("") || "<p>No data yet.</p>";
    });
  }

  function fillAccountSelects() {
    const accountOptions = accounts
      .map(
        (account) => `
          <option value="${account.id}">
            ${escapeHTML(account.name)}
          </option>
        `
      )
      .join("");

    $("txAccount").innerHTML = accountOptions;

    $("txToAccount").innerHTML = `
      <option value="">No destination</option>
      ${accountOptions}
      ${cards
        .map(
          (card) => `
            <option value="card:${card.id}">
              ${escapeHTML(card.name)} card
            </option>
          `
        )
        .join("")}
    `;
  }

  async function login() {
    const email = $("email").value.trim();
    const password = $("password").value;

    if (!email || !password) {
      showMessage(
        "authMessage",
        "Enter your email and password."
      );
      return;
    }

    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    showMessage(
      "authMessage",
      error ? error.message : ""
    );
  }

  async function signup() {
    const email = $("email").value.trim();
    const password = $("password").value;

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

    const { error } = await db.auth.signUp({
      email,
      password
    });

    showMessage(
      "authMessage",
      error
        ? error.message
        : "Account created. Check your email if confirmation is enabled."
    );
  }

  async function saveAccount(event) {
    event.preventDefault();

    const { error } = await db.from("accounts").insert({
      user_id: currentUser.id,
      name: $("accountName").value.trim(),
      type: $("accountType").value,
      opening_balance: Number(
        $("accountOpening").value
      )
    });

    if (error) {
      alert(error.message);
      return;
    }

    closeDialog("accountDialog");
    $("accountForm").reset();
    await loadAll();
  }

  async function saveCard(event) {
    event.preventDefault();

    const { error } = await db.from("credit_cards").insert({
      user_id: currentUser.id,
      name: $("cardName").value.trim(),
      credit_limit: Number($("cardLimit").value),
      opening_outstanding: Number(
        $("cardOpening").value
      ),
      due_date: $("cardDue").value || null
    });

    if (error) {
      alert(error.message);
      return;
    }

    closeDialog("cardDialog");
    $("cardForm").reset();
    await loadAll();
  }

  async function saveTransaction(event) {
    event.preventDefault();

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
      account_id: $("txAccount").value || null,
      to_account_id: null,
      to_card_id: null
    };

    if (type === "transfer") {
      transaction.to_account_id =
        destination || null;
    }

    if (
      type === "card_payment" &&
      destination.startsWith("card:")
    ) {
      transaction.to_card_id =
        destination.replace("card:", "");
    }

    const { error } = await db
      .from("transactions")
      .insert(transaction);

    if (error) {
      showMessage("txMessage", error.message);
      return;
    }

    closeDialog("transactionDialog");
    $("transactionForm").reset();
    await loadAll();
  }

  function openTransactionForm() {
    $("transactionForm").reset();
    $("txDate").value = today();
    $("txToAccount").disabled = true;
    openDialog("transactionDialog");
  }

  function bindEvents() {
    $("loginBtn").addEventListener("click", login);
    $("signupBtn").addEventListener("click", signup);

    $("logoutBtn").addEventListener("click", () => {
      db.auth.signOut();
    });

    document
      .querySelectorAll(".tabs button")
      .forEach((button) => {
        button.addEventListener("click", () => {
          showTab(button.dataset.tab);
        });
      });

    $("quickAdd").addEventListener(
      "click",
      openTransactionForm
    );

    $("addTransactionBtn").addEventListener(
      "click",
      openTransactionForm
    );

    $("addAccountBtn").addEventListener("click", () => {
      $("accountForm").reset();
      openDialog("accountDialog");
    });

    $("addCardBtn").addEventListener("click", () => {
      $("cardForm").reset();
      openDialog("cardDialog");
    });

    $("txType").addEventListener("change", () => {
      $("txToAccount").disabled =
        !["transfer", "card_payment"].includes(
          $("txType").value
        );
    });

    $("saveAccountBtn").addEventListener(
      "click",
      saveAccount
    );

    $("saveCardBtn").addEventListener(
      "click",
      saveCard
    );

    $("saveTransactionBtn").addEventListener(
      "click",
      saveTransaction
    );
  }

  function updateScreen(session) {
    currentUser = session?.user || null;

    $("authView").classList.toggle(
      "hidden",
      Boolean(currentUser)
    );

    $("appView").classList.toggle(
      "hidden",
      !currentUser
    );

    $("logoutBtn").classList.toggle(
      "hidden",
      !currentUser
    );

    if (currentUser) {
      loadAll();
    }
  }

  bindEvents();

  db.auth.getSession().then(({ data }) => {
    updateScreen(data.session);
  });

  db.auth.onAuthStateChange((_event, session) => {
    updateScreen(session);
  });
})();