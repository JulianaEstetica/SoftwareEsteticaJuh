import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const DEFAULT_CATEGORIES = {
  receita: ["Procedimento", "Produto", "Pacote", "Sinal", "Outro"],
  despesa: [
    "Produtos",
    "Materiais descartaveis",
    "Aluguel",
    "Energia",
    "Agua",
    "Internet",
    "Marketing",
    "Comissao",
    "Impostos",
    "Taxas de cartao",
    "Sistema/software",
    "Outro"
  ],
  investimento: ["Aparelho", "Equipamento", "Movel", "Curso", "Reforma", "Tecnologia", "Outro"]
};

const state = {
  uid: null,
  clientes: [],
  procedimentos: [],
  notificacoes: [],
  receitas: [],
  despesas: [],
  investimentos: [],
  categorias: [],
  unsubscribers: [],
  defaultsSeededForUid: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const authScreen = $("#auth-screen");
const appScreen = $("#app-screen");
const authForm = $("#auth-form");
const authMessage = $("#auth-message");
const createAccountButton = $("#create-account-button");
const logoutButton = $("#logout-button");
const userEmail = $("#user-email");
const mobileMenuButton = $("#mobile-menu-button");
const sidebar = $(".sidebar");

const clientForm = $("#client-form");
const clientSearch = $("#client-search");
const cancelClientEdit = $("#cancel-client-edit");
const clientMessage = $("#client-message");
const procedureForm = $("#procedure-form");
const cancelProcedureEdit = $("#cancel-procedure-edit");
const notificationFilter = $("#notification-filter");

const revenueForm = $("#revenue-form");
const expenseForm = $("#expense-form");
const investmentForm = $("#investment-form");
const categoryForm = $("#category-form");
const financePeriod = $("#finance-period");

const pathFor = (name) => collection(db, "users", state.uid, name);
const docFor = (name, id) => doc(db, "users", state.uid, name, id);
const financePath = (name) => collection(db, "users", state.uid, "financeiro", name);
const financeDoc = (name, id) => doc(db, "users", state.uid, "financeiro", name, id);

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, $("#auth-email").value.trim(), $("#auth-password").value);
  } catch (error) {
    authMessage.textContent = friendlyAuthError(error);
  }
});

createAccountButton.addEventListener("click", async () => {
  authMessage.textContent = "";

  try {
    await createUserWithEmailAndPassword(auth, $("#auth-email").value.trim(), $("#auth-password").value);
    authMessage.textContent = "Conta criada. Agora cadastre seus clientes na aba Clientes.";
    authMessage.classList.remove("error");
    authMessage.classList.add("success-message");
  } catch (error) {
    authMessage.classList.remove("success-message");
    authMessage.classList.add("error");
    authMessage.textContent = friendlyAuthError(error);
  }
});

logoutButton.addEventListener("click", () => signOut(auth));
mobileMenuButton.addEventListener("click", () => sidebar.classList.toggle("open"));

$$(".nav-link").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
$$(".tab-button").forEach((button) => button.addEventListener("click", () => showFinanceTab(button.dataset.financeTab)));

onAuthStateChanged(auth, (user) => {
  clearSubscriptions();

  if (!user) {
    state.uid = null;
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    return;
  }

  state.uid = user.uid;
  userEmail.textContent = user.email;
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  subscribeToData();
});

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clientMessage.textContent = "";
  clientMessage.classList.remove("success-message");

  if (!state.uid) {
    clientMessage.textContent = "Voce precisa estar logada para salvar clientes.";
    return;
  }

  try {
    const id = $("#client-id").value;
    const payload = {
      nome: $("#client-name").value.trim(),
      nascimento: $("#client-birth").value,
      telefone: $("#client-phone").value.trim(),
      email: $("#client-email").value.trim(),
      instagram: $("#client-instagram").value.trim(),
      endereco: $("#client-address").value.trim(),
      observacoes: $("#client-notes").value.trim(),
      status_brinde: $("#client-gift-status").value,
      indicacoes_convertidas: Number(getClientById(id)?.indicacoes_convertidas || 0),
      ultimo_procedimento: getClientById(id)?.ultimo_procedimento || "",
      ultima_limpeza: getClientById(id)?.ultima_limpeza || ""
    };

    if (id) {
      await updateDoc(docFor("clientes", id), { ...payload, atualizado_em: serverTimestamp() });
    } else {
      const docRef = await addDoc(pathFor("clientes"), {
        ...payload,
        data_cadastro: todayISO(),
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp()
      });
      await updateDoc(docRef, { id: docRef.id });
    }

    resetClientForm();
    clientMessage.textContent = "Cliente salvo com sucesso. Se nao aparecer na lista, verifique o campo de busca.";
    clientMessage.classList.add("success-message");
  } catch (error) {
    console.error("Erro ao salvar cliente:", error);
    clientMessage.textContent = firestoreErrorMessage(error, "Nao foi possivel salvar o cliente.");
  }
});

procedureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProcedure();
});

revenueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#revenue-id").value;
  const payload = revenuePayloadFromForm();
  await saveFinanceRecord("receitas", id, payload);
  resetRevenueForm();
});

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#expense-id").value;
  const payload = expensePayloadFromForm();
  await saveFinanceRecord("despesas", id, payload);
  resetExpenseForm();
});

investmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#investment-id").value;
  const payload = investmentPayloadFromForm();
  await saveFinanceRecord("investimentos", id, payload);
  resetInvestmentForm();
});

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#category-id").value;
  const payload = {
    nome: $("#category-name").value.trim(),
    tipo: $("#category-type").value
  };
  await saveFinanceRecord("categorias", id, payload);
  resetCategoryForm();
});

cancelClientEdit.addEventListener("click", resetClientForm);
cancelProcedureEdit.addEventListener("click", resetProcedureForm);
$("#cancel-revenue-edit").addEventListener("click", resetRevenueForm);
$("#cancel-expense-edit").addEventListener("click", resetExpenseForm);
$("#cancel-investment-edit").addEventListener("click", resetInvestmentForm);
$("#cancel-category-edit").addEventListener("click", resetCategoryForm);

clientSearch.addEventListener("input", renderClients);
notificationFilter.addEventListener("change", renderNotifications);
financePeriod.addEventListener("change", renderAll);
$("#finance-start-date").addEventListener("change", renderAll);
$("#finance-end-date").addEventListener("change", renderAll);
$("#revenue-status-filter").addEventListener("change", renderRevenues);
$("#expense-category-filter").addEventListener("change", renderExpenses);
$("#expense-type-filter").addEventListener("change", renderExpenses);
$("#expense-status-filter").addEventListener("change", renderExpenses);
$("#export-finance-csv").addEventListener("click", exportFinanceCSV);
$("#investment-total-value").addEventListener("input", syncInstallmentValue);
$("#investment-installments").addEventListener("input", syncInstallmentValue);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit-client") fillClientForm(getClientById(id));
  if (action === "delete-client" && confirm("Excluir este cliente?")) await deleteDoc(docFor("clientes", id));
  if (action === "whatsapp-client") openWhatsApp(getClientById(id), `Ola ${firstName(getClientById(id)?.nome)}! Tudo bem?`);

  if (action === "edit-procedure") fillProcedureForm(getProcedureById(id));
  if (action === "delete-procedure") await deleteProcedure(id);

  if (action === "edit-revenue") fillRevenueForm(getFinanceById("receitas", id));
  if (action === "delete-revenue" && confirm("Excluir esta receita?")) await deleteDoc(financeDoc("receitas", id));

  if (action === "edit-expense") fillExpenseForm(getFinanceById("despesas", id));
  if (action === "delete-expense" && confirm("Excluir esta despesa?")) await deleteDoc(financeDoc("despesas", id));

  if (action === "edit-investment") fillInvestmentForm(getFinanceById("investimentos", id));
  if (action === "delete-investment" && confirm("Excluir este investimento?")) {
    await deleteDoc(financeDoc("investimentos", id));
  }
  if (action === "mark-investment-paid") {
    await updateDoc(financeDoc("investimentos", id), { status: "Pago", atualizado_em: serverTimestamp() });
  }

  if (action === "edit-category") fillCategoryForm(getFinanceById("categorias", id));
  if (action === "delete-category" && confirm("Excluir esta categoria?")) await deleteDoc(financeDoc("categorias", id));

  if (action === "whatsapp-notification") {
    const notificacao = state.notificacoes.find((item) => item.id === id);
    const cliente = getClientById(notificacao.cliente_id);
    openWhatsApp(cliente, whatsappMessageForNotification(cliente, notificacao));
  }

  if (action === "resolve-notification") {
    await updateDoc(docFor("notificacoes", id), { status: "resolvido" });
  }
});

function subscribeToData() {
  const coreSubscriptions = [
    {
      label: "clientes",
      itemQuery: query(pathFor("clientes"), orderBy("nome")),
      setter: (docs) => (state.clientes = docs)
    },
    {
      label: "procedimentos",
      itemQuery: query(pathFor("procedimentos"), orderBy("data", "desc")),
      setter: (docs) => (state.procedimentos = docs)
    },
    {
      label: "notificacoes",
      itemQuery: query(pathFor("notificacoes"), orderBy("data_aviso", "desc")),
      setter: (docs) => (state.notificacoes = docs)
    }
  ];

  const financeSubscriptions = [
    {
      label: "receitas",
      itemQuery: query(financePath("receitas"), orderBy("data", "desc")),
      setter: (docs) => (state.receitas = docs)
    },
    {
      label: "despesas",
      itemQuery: query(financePath("despesas"), orderBy("data", "desc")),
      setter: (docs) => (state.despesas = docs)
    },
    {
      label: "investimentos",
      itemQuery: query(financePath("investimentos"), orderBy("data_compra", "desc")),
      setter: (docs) => (state.investimentos = docs)
    },
    {
      label: "categorias financeiras",
      itemQuery: query(financePath("categorias"), orderBy("nome")),
      setter: handleCategoriesSnapshot
    }
  ];

  state.unsubscribers = [
    ...coreSubscriptions.map((subscription) => subscribeToCollection(subscription, showCoreDataLoadError)),
    ...financeSubscriptions.map((subscription) => subscribeToCollection(subscription, showFinanceDataLoadError))
  ];
}

function subscribeToCollection({ label, itemQuery, setter }, onError) {
  return onSnapshot(
    itemQuery,
    (snapshot) => {
      Promise.resolve(setter(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))).catch((error) => {
        console.error(`Erro ao processar ${label}:`, error);
        onError(error, label);
      });
      renderAll();
    },
    (error) => {
      console.error(`Erro ao carregar ${label}:`, error);
      onError(error, label);
    }
  );
}

function showCoreDataLoadError(error, label) {
  if (label !== "clientes") return;
  const message = firestoreErrorMessage(error, "Nao foi possivel carregar os clientes.");
  const clientsList = $("#clients-list");
  if (clientsList) {
    clientsList.textContent = message;
    clientsList.classList.add("empty-state");
  }
}

function showFinanceDataLoadError(error, label) {
  console.warn(`O financeiro nao carregou ${label}. Os clientes continuam independentes.`, error);
  state.receitas = state.receitas || [];
  state.despesas = state.despesas || [];
  state.investimentos = state.investimentos || [];
  state.categorias = state.categorias || [];
  renderAll();
  const alerts = $("#financial-alerts");
  if (alerts) {
    alerts.textContent = firestoreErrorMessage(error, "Nao foi possivel carregar o financeiro.");
    alerts.classList.add("empty-state");
  }
}

async function handleCategoriesSnapshot(docs) {
  state.categorias = docs;
  if (docs.length === 0 && state.defaultsSeededForUid !== state.uid) {
    state.defaultsSeededForUid = state.uid;
    try {
      await seedDefaultCategories();
    } catch (error) {
      console.warn("Nao foi possivel criar categorias financeiras padrao.", error);
    }
  }
}

async function seedDefaultCategories() {
  const entries = Object.entries(DEFAULT_CATEGORIES).flatMap(([tipo, nomes]) => nomes.map((nome) => ({ tipo, nome })));
  await Promise.all(
    entries.map(async (categoria) => {
      const docRef = await addDoc(financePath("categorias"), {
        ...categoria,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp()
      });
      await updateDoc(docRef, { id: docRef.id });
    })
  );
}

function clearSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  state.clientes = [];
  state.procedimentos = [];
  state.notificacoes = [];
  state.receitas = [];
  state.despesas = [];
  state.investimentos = [];
  state.categorias = [];
}

function renderAll() {
  toggleCustomPeriod();
  renderDashboard();
  renderClients();
  renderClientOptions();
  renderProcedureOptions();
  renderCategoryOptions();
  renderProcedures();
  renderNotifications();
  renderFinanceSummary();
  renderRevenues();
  renderExpenses();
  renderInvestments();
  renderCategories();
  renderReports();
}

function renderDashboard() {
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const period = monthRange(today);
  const summary = calculateFinanceSummary(period.start, period.end);
  const birthdaysToday = state.clientes.filter((cliente) => isSameMonthDay(cliente.nascimento, today));
  const returnsToday = state.notificacoes.filter(
    (item) => item.tipo === "Retorno de limpeza" && item.data_aviso === today && item.status === "pendente"
  );
  const cleaningsThisMonth = state.procedimentos.filter(
    (item) => isSkinCleaning(item.procedimento) && item.data?.startsWith(currentMonth)
  );
  const pendingNotifications = state.notificacoes.filter((item) => item.status === "pendente");

  $("#metric-total-clientes").textContent = state.clientes.length;
  $("#metric-receita-mes").textContent = formatMoney(summary.receivedRevenue);
  $("#metric-lucro-mes").textContent = formatMoney(summary.netProfit);
  $("#metric-despesas-mes").textContent = formatMoney(summary.paidExpenses);
  $("#metric-pendencias-receber").textContent = formatMoney(summary.pendingRevenue);
  $("#metric-limpezas-mes").textContent = cleaningsThisMonth.length;
  $("#metric-aniversarios-hoje").textContent = birthdaysToday.length;
  $("#metric-notificacoes").textContent = pendingNotifications.length;

  const todayItems = [
    ...birthdaysToday.map((cliente) => summaryCard("Aniversario hoje", cliente.nome, "warning")),
    ...pendingNotifications
      .filter((item) => item.data_aviso === today)
      .map((item) => summaryCard(item.tipo, item.mensagem, "success"))
  ];

  $("#today-summary").innerHTML = todayItems.join("") || "Nenhuma acao importante para hoje.";
  $("#today-summary").classList.toggle("empty-state", todayItems.length === 0);

  const returnItems = returnsToday.map((item) => {
    const cliente = getClientById(item.cliente_id);
    return summaryCard("Retorno de limpeza", cliente?.nome || "Cliente removido", "warning");
  });

  $("#return-summary").innerHTML = returnItems.join("") || "Nenhum retorno vencendo hoje.";
  $("#return-summary").classList.toggle("empty-state", returnItems.length === 0);
}

function renderClients() {
  const term = clientSearch.value.trim().toLowerCase();
  const clientes = state.clientes.filter((cliente) => cliente.nome?.toLowerCase().includes(term));

  $("#clients-list").innerHTML =
    clientes
      .map(
        (cliente) => `
          <article class="record-card">
            <header>
              <div>
                <strong>${escapeHTML(cliente.nome)}</strong>
                <div class="record-meta">
                  <span>${formatDate(cliente.nascimento) || "Sem nascimento"}</span>
                  <span>${escapeHTML(cliente.telefone || "Sem WhatsApp")}</span>
                  <span class="tag">${escapeHTML(cliente.status_brinde || "Sem brinde")}</span>
                </div>
              </div>
            </header>
            <div class="record-meta">
              <span>Ultimo procedimento: ${escapeHTML(cliente.ultimo_procedimento || "Nenhum")}</span>
              <span>Ultima limpeza: ${formatDate(cliente.ultima_limpeza) || "Nenhuma"}</span>
            </div>
            <div class="record-actions">
              <button class="button ghost" type="button" data-action="whatsapp-client" data-id="${cliente.id}">WhatsApp</button>
              <button class="button subtle" type="button" data-action="edit-client" data-id="${cliente.id}">Editar</button>
              <button class="button danger" type="button" data-action="delete-client" data-id="${cliente.id}">Excluir</button>
            </div>
          </article>
        `
      )
      .join("") || "Nenhum cliente cadastrado.";

  $("#clients-list").classList.toggle("empty-state", clientes.length === 0);
}

function renderClientOptions() {
  const options = state.clientes.map((cliente) => `<option value="${cliente.id}">${escapeHTML(cliente.nome)}</option>`).join("");
  $("#procedure-client").innerHTML = options || `<option value="">Cadastre um cliente primeiro</option>`;
  $("#revenue-client").innerHTML = `<option value="">Sem cliente vinculado</option>${options}`;
}

function renderProcedureOptions() {
  $("#revenue-procedure").innerHTML =
    `<option value="">Sem procedimento vinculado</option>` +
    state.procedimentos
      .map((item) => `<option value="${item.id}">${escapeHTML(item.procedimento)} - ${formatDate(item.data)}</option>`)
      .join("");
}

function renderCategoryOptions() {
  fillSelect("#expense-category", categoryOptions("despesa"));
  fillSelect("#expense-category-filter", [{ value: "", label: "Todas categorias" }, ...categoryOptions("despesa")]);
  fillSelect("#investment-category", categoryOptions("investimento"));
}

function fillSelect(selector, options) {
  const select = $(selector);
  const current = select.value;
  select.innerHTML = options.map((item) => `<option value="${escapeHTML(item.value)}">${escapeHTML(item.label)}</option>`).join("");
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renderProcedures() {
  $("#procedures-list").innerHTML =
    state.procedimentos
      .map((item) => {
        const cliente = getClientById(item.cliente_id);
        return `
          <article class="record-card">
            <header>
              <div>
                <strong>${escapeHTML(item.procedimento)}</strong>
                <div class="record-meta">
                  <span>${escapeHTML(cliente?.nome || "Cliente removido")}</span>
                  <span>${formatDate(item.data)}</span>
                  <span>${formatMoney(item.valor)}</span>
                  <span>Custo: ${formatMoney(item.custo_estimado)}</span>
                </div>
              </div>
              ${item.receita_id ? '<span class="tag success">Receita gerada</span>' : ""}
            </header>
            ${item.observacoes ? `<p>${escapeHTML(item.observacoes)}</p>` : ""}
            <div class="record-actions">
              <button class="button subtle" type="button" data-action="edit-procedure" data-id="${item.id}">Editar</button>
              <button class="button danger" type="button" data-action="delete-procedure" data-id="${item.id}">Excluir</button>
            </div>
          </article>
        `;
      })
      .join("") || "Nenhum procedimento registrado.";

  $("#procedures-list").classList.toggle("empty-state", state.procedimentos.length === 0);
}

function renderNotifications() {
  const filter = notificationFilter.value;
  const notificacoes = state.notificacoes.filter((item) => filter === "todas" || item.status === filter);

  $("#notifications-list").innerHTML =
    notificacoes.map(notificationCard).join("") || "Nenhuma notificacao encontrada.";
  $("#notifications-list").classList.toggle("empty-state", notificacoes.length === 0);
}

function renderFinanceSummary() {
  const { start, end } = selectedFinancePeriod();
  const summary = calculateFinanceSummary(start, end);
  const profitCard = $("#finance-card-profit").closest(".metric-card");

  $("#finance-card-revenue").textContent = formatMoney(summary.grossRevenue);
  $("#finance-card-expenses").textContent = formatMoney(summary.paidExpenses);
  $("#finance-card-investments").textContent = formatMoney(summary.paidInvestments);
  $("#finance-card-profit").textContent = formatMoney(summary.netProfit);
  $("#finance-card-ticket").textContent = formatMoney(summary.averageTicket);
  $("#finance-card-paid-count").textContent = summary.paidAttendanceCount;
  $("#finance-card-margin").textContent = `${formatPercent(summary.margin)}%`;
  $("#finance-card-open").textContent = formatMoney(summary.pendingRevenue);
  $("#finance-card-received").textContent = formatMoney(summary.receivedRevenue);
  profitCard.classList.toggle("negative", summary.netProfit < 0);

  renderBars("#cashflow-bars", [
    { label: "Receita recebida", value: summary.receivedRevenue, variant: "income" },
    { label: "Despesas pagas", value: summary.paidExpenses, variant: "expense" },
    { label: "Investimentos considerados", value: summary.paidInvestments, variant: "investment" }
  ]);

  const alerts = [
    ...summary.pendingRevenues.map((item) =>
      summaryCard("Receita pendente", `${clientName(item.cliente_id)} - ${formatMoney(item.valor)}`, "warning")
    ),
    ...summary.pendingExpenses.map((item) => summaryCard("Despesa pendente", `${item.descricao} - ${formatMoney(item.valor)}`, "warning")),
    ...summary.pendingInvestments.map((item) =>
      summaryCard("Investimento pendente", `${item.descricao} - ${formatMoney(investmentPeriodValue(item, start, end))}`, "warning")
    )
  ];
  $("#financial-alerts").innerHTML = alerts.join("") || "Nenhuma pendencia financeira no periodo.";
  $("#financial-alerts").classList.toggle("empty-state", alerts.length === 0);
}

function renderRevenues() {
  const { start, end } = selectedFinancePeriod();
  const status = $("#revenue-status-filter").value;
  const receitas = state.receitas.filter((item) => inDateRange(item.data, start, end) && (!status || item.status === status));

  $("#revenues-list").innerHTML =
    receitas.map(revenueCard).join("") || "Nenhuma receita cadastrada no periodo.";
  $("#revenues-list").classList.toggle("empty-state", receitas.length === 0);
}

function renderExpenses() {
  const { start, end } = selectedFinancePeriod();
  const category = $("#expense-category-filter").value;
  const type = $("#expense-type-filter").value;
  const status = $("#expense-status-filter").value;
  const despesas = state.despesas.filter(
    (item) =>
      inDateRange(item.data, start, end) &&
      (!category || item.categoria === category) &&
      (!type || item.tipo === type) &&
      (!status || item.status === status)
  );

  $("#expenses-list").innerHTML =
    despesas.map(expenseCard).join("") || "Nenhuma despesa cadastrada no periodo.";
  $("#expenses-list").classList.toggle("empty-state", despesas.length === 0);
}

function renderInvestments() {
  const { start, end } = selectedFinancePeriod();
  const investimentos = state.investimentos.filter((item) => investmentTouchesPeriod(item, start, end));

  $("#investments-list").innerHTML =
    investimentos.map(investmentCard).join("") || "Nenhum investimento cadastrado no periodo.";
  $("#investments-list").classList.toggle("empty-state", investimentos.length === 0);
}

function renderCategories() {
  $("#categories-list").innerHTML =
    state.categorias
      .map(
        (item) => `
          <article class="record-card">
            <header>
              <div>
                <strong>${escapeHTML(item.nome)}</strong>
                <div class="record-meta"><span class="tag">${escapeHTML(categoryTypeLabel(item.tipo))}</span></div>
              </div>
            </header>
            <div class="record-actions">
              <button class="button subtle" type="button" data-action="edit-category" data-id="${item.id}">Editar</button>
              <button class="button danger" type="button" data-action="delete-category" data-id="${item.id}">Excluir</button>
            </div>
          </article>
        `
      )
      .join("") || "Nenhuma categoria cadastrada.";
  $("#categories-list").classList.toggle("empty-state", state.categorias.length === 0);
}

function renderReports() {
  const { start, end } = selectedFinancePeriod();
  const summary = calculateFinanceSummary(start, end);

  $("#monthly-report").innerHTML = [
    reportLine("Receita bruta", formatMoney(summary.grossRevenue)),
    reportLine("Receita recebida", formatMoney(summary.receivedRevenue)),
    reportLine("Receita pendente", formatMoney(summary.pendingRevenue)),
    reportLine("Despesas pagas", formatMoney(summary.paidExpenses)),
    reportLine("Despesas pendentes", formatMoney(summary.pendingExpensesValue)),
    reportLine("Investimentos pagos", formatMoney(summary.paidInvestments)),
    reportLine("Lucro liquido", formatMoney(summary.netProfit)),
    reportLine("Margem de lucro", `${formatPercent(summary.margin)}%`),
    reportLine("Ticket medio", formatMoney(summary.averageTicket)),
    reportLine("Atendimentos pagos", summary.paidAttendanceCount)
  ].join("");

  renderProcedureReport(start, end);
  renderPaymentReport(start, end);
  renderExpenseCategoryReport(start, end);
  renderInvestmentReport(start, end);
}

async function saveProcedure() {
  const id = $("#procedure-id").value;
  const oldProcedure = getProcedureById(id);
  const clienteId = $("#procedure-client").value;
  const cliente = getClientById(clienteId);
  const procedimento = $("#procedure-name").value.trim();
  const data = $("#procedure-date").value;
  const valor = toNumber($("#procedure-value").value);
  const custoEstimado = toNumber($("#procedure-cost").value);
  const observacoes = $("#procedure-notes").value.trim();
  const shouldGenerateRevenue = $("#procedure-generate-revenue").checked && valor > 0;

  const payload = {
    cliente_id: clienteId,
    procedimento,
    data,
    valor,
    custo_estimado: custoEstimado,
    categoria_financeira: $("#procedure-finance-category").value,
    gerar_receita_financeiro: shouldGenerateRevenue,
    forma_pagamento: $("#procedure-payment-method").value,
    status_pagamento: $("#procedure-payment-status").value,
    observacoes,
    atualizado_em: serverTimestamp()
  };

  let procedureId = id;
  let procedureDocRef;

  if (id) {
    procedureDocRef = docFor("procedimentos", id);
    await updateDoc(procedureDocRef, payload);
  } else {
    procedureDocRef = await addDoc(pathFor("procedimentos"), { ...payload, criado_em: serverTimestamp() });
    procedureId = procedureDocRef.id;
    await updateDoc(procedureDocRef, { id: procedureId });
  }

  if (shouldGenerateRevenue) {
    const revenuePayload = revenuePayloadFromProcedure({ ...payload, id: procedureId });
    if (oldProcedure?.receita_id) {
      await updateDoc(financeDoc("receitas", oldProcedure.receita_id), revenuePayload);
      await updateDoc(procedureDocRef, { receita_id: oldProcedure.receita_id });
    } else {
      const receitaRef = await addDoc(financePath("receitas"), {
        ...revenuePayload,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp()
      });
      await updateDoc(receitaRef, { id: receitaRef.id });
      await updateDoc(procedureDocRef, { receita_id: receitaRef.id });
    }
  } else if (oldProcedure?.receita_id) {
    const deleteLinked = confirm("Este procedimento possui receita vinculada. Deseja excluir a receita? Clique em Cancelar para apenas desvincular.");
    if (deleteLinked) await deleteDoc(financeDoc("receitas", oldProcedure.receita_id));
    await updateDoc(procedureDocRef, { receita_id: "" });
  }

  if (cliente) {
    const clientUpdate = { ultimo_procedimento: procedimento };
    if (isSkinCleaning(procedimento)) {
      const returnDate = addDays(data, 30);
      clientUpdate.ultima_limpeza = data;
      const notificationRef = await addDoc(pathFor("notificacoes"), {
        tipo: "Retorno de limpeza",
        cliente_id: clienteId,
        data_aviso: returnDate,
        mensagem: `Cliente ${cliente.nome} ja faz 30 dias da limpeza de pele. Entre em contato para agendar manutencao.`,
        status: "pendente",
        criado_em: serverTimestamp()
      });
      await updateDoc(notificationRef, { id: notificationRef.id });
    }
    await updateDoc(docFor("clientes", clienteId), clientUpdate);
  }

  resetProcedureForm();
}

async function deleteProcedure(id) {
  const procedimento = getProcedureById(id);
  if (!procedimento || !confirm("Excluir este procedimento?")) return;

  if (procedimento.receita_id) {
    const deleteRevenue = confirm("Excluir tambem a receita vinculada? Clique em Cancelar para apenas desvincular.");
    if (deleteRevenue) await deleteDoc(financeDoc("receitas", procedimento.receita_id));
  }
  await deleteDoc(docFor("procedimentos", id));
}

async function saveFinanceRecord(collectionName, id, payload) {
  if (id) {
    await updateDoc(financeDoc(collectionName, id), {
      ...payload,
      updated_at: serverTimestamp(),
      atualizado_em: serverTimestamp()
    });
  } else {
    const docRef = await addDoc(financePath(collectionName), {
      ...payload,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp()
    });
    await updateDoc(docRef, { id: docRef.id });
  }
}

function revenuePayloadFromForm() {
  return {
    cliente_id: $("#revenue-client").value,
    procedimento_id: $("#revenue-procedure").value,
    tipo: $("#revenue-type").value,
    descricao: $("#revenue-description").value.trim(),
    data: $("#revenue-date").value,
    valor: toNumber($("#revenue-value").value),
    forma_pagamento: $("#revenue-payment-method").value,
    status: $("#revenue-status").value,
    observacoes: $("#revenue-notes").value.trim()
  };
}

function revenuePayloadFromProcedure(procedure) {
  return {
    cliente_id: procedure.cliente_id,
    procedimento_id: procedure.id,
    tipo: procedure.categoria_financeira || "Procedimento",
    descricao: procedure.procedimento,
    data: procedure.data,
    valor: Number(procedure.valor || 0),
    forma_pagamento: procedure.forma_pagamento || "Pix",
    status: procedure.status_pagamento || "Recebido",
    observacoes: procedure.observacoes || "",
    atualizado_em: serverTimestamp()
  };
}

function expensePayloadFromForm() {
  const recorrente = $("#expense-recurring").checked;
  return {
    descricao: $("#expense-description").value.trim(),
    categoria: $("#expense-category").value,
    tipo: $("#expense-type").value,
    data: $("#expense-date").value,
    valor: toNumber($("#expense-value").value),
    status: $("#expense-status").value,
    forma_pagamento: $("#expense-payment-method").value,
    observacoes: $("#expense-notes").value.trim(),
    recorrente,
    periodicidade: recorrente ? $("#expense-periodicity").value : ""
  };
}

function investmentPayloadFromForm() {
  const total = toNumber($("#investment-total-value").value);
  const installments = Math.max(1, Number($("#investment-installments").value || 1));
  return {
    descricao: $("#investment-description").value.trim(),
    categoria: $("#investment-category").value,
    data_compra: $("#investment-date").value,
    valor_total: total,
    forma_pagamento: $("#investment-payment-method").value,
    status: $("#investment-status").value,
    quantidade_parcelas: installments,
    parcela_atual: Math.max(1, Number($("#investment-current-installment").value || 1)),
    valor_parcela: toNumber($("#investment-installment-value").value) || total / installments,
    considerar_no_lucro: $("#investment-consider-profit").checked,
    observacoes: $("#investment-notes").value.trim()
  };
}

function calculateFinanceSummary(start, end) {
  const revenues = state.receitas.filter((item) => inDateRange(item.data, start, end));
  const expenses = state.despesas.filter((item) => inDateRange(item.data, start, end));
  const investments = state.investimentos.filter((item) => investmentTouchesPeriod(item, start, end));

  const validRevenues = revenues.filter((item) => item.status !== "Cancelado");
  const receivedRevenues = validRevenues.filter((item) => item.status === "Recebido");
  const pendingRevenues = validRevenues.filter((item) => item.status === "Pendente");
  const paidExpensesList = expenses.filter((item) => item.status === "Pago");
  const pendingExpenses = expenses.filter((item) => item.status === "Pendente");
  const paidInvestmentsList = investments.filter((item) => item.status !== "Cancelado" && item.status !== "Pendente" && item.considerar_no_lucro !== false);
  const pendingInvestments = investments.filter((item) => item.status === "Pendente");

  const receivedRevenue = sumBy(receivedRevenues, "valor");
  const paidExpenses = sumBy(paidExpensesList, "valor");
  const paidInvestments = paidInvestmentsList.reduce((total, item) => total + investmentPeriodValue(item, start, end), 0);
  const paidAttendanceCount = receivedRevenues.filter((item) => item.tipo === "Procedimento" || item.procedimento_id).length;
  const netProfit = receivedRevenue - paidExpenses - paidInvestments;

  return {
    grossRevenue: sumBy(validRevenues, "valor"),
    receivedRevenue,
    pendingRevenue: sumBy(pendingRevenues, "valor"),
    paidExpenses,
    pendingExpensesValue: sumBy(pendingExpenses, "valor"),
    paidInvestments,
    netProfit,
    averageTicket: paidAttendanceCount ? receivedRevenue / paidAttendanceCount : 0,
    paidAttendanceCount,
    margin: receivedRevenue ? (netProfit / receivedRevenue) * 100 : 0,
    pendingRevenues,
    pendingExpenses,
    pendingInvestments
  };
}

function investmentPeriodValue(item, start, end) {
  if (item.status === "Cancelado") return 0;
  const total = Number(item.valor_total || 0);
  const installments = Math.max(1, Number(item.quantidade_parcelas || 1));
  const installmentValue = Number(item.valor_parcela || total / installments);
  if (item.status !== "Parcelado" || installments === 1) return inDateRange(item.data_compra, start, end) ? total : 0;

  return investmentInstallmentDates(item)
    .filter((date) => inDateRange(date, start, end))
    .reduce((sum) => sum + installmentValue, 0);
}

function investmentTouchesPeriod(item, start, end) {
  if (item.status === "Parcelado") return investmentInstallmentDates(item).some((date) => inDateRange(date, start, end));
  return inDateRange(item.data_compra, start, end);
}

function investmentInstallmentDates(item) {
  const dates = [];
  const [year, month, day] = (item.data_compra || todayISO()).split("-").map(Number);
  const installments = Math.max(1, Number(item.quantidade_parcelas || 1));
  for (let index = 0; index < installments; index += 1) {
    const date = new Date(year, month - 1 + index, day);
    dates.push(dateToISO(date));
  }
  return dates;
}

function selectedFinancePeriod() {
  const today = todayISO();
  const selected = financePeriod.value;
  if (selected === "today") return { start: today, end: today };
  if (selected === "week") return weekRange(today);
  if (selected === "previous-month") return previousMonthRange(today);
  if (selected === "custom") return { start: $("#finance-start-date").value || today, end: $("#finance-end-date").value || today };
  return monthRange(today);
}

function toggleCustomPeriod() {
  const isCustom = financePeriod.value === "custom";
  $$(".custom-period").forEach((item) => item.classList.toggle("hidden", !isCustom));
}

function showView(viewId) {
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $("#view-title").textContent = document.querySelector(`[data-view="${viewId}"]`).textContent;
  sidebar.classList.remove("open");
}

function showFinanceTab(tabId) {
  $$(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.financeTab === tabId));
  $$(".finance-tab").forEach((tab) => tab.classList.toggle("active", tab.id === tabId));
}

function fillClientForm(cliente) {
  $("#client-id").value = cliente.id;
  $("#client-name").value = cliente.nome || "";
  $("#client-birth").value = cliente.nascimento || "";
  $("#client-phone").value = cliente.telefone || "";
  $("#client-email").value = cliente.email || "";
  $("#client-instagram").value = cliente.instagram || "";
  $("#client-address").value = cliente.endereco || "";
  $("#client-notes").value = cliente.observacoes || "";
  $("#client-gift-status").value = cliente.status_brinde || "Sem brinde";
  $("#client-form-title").textContent = "Editar cliente";
  cancelClientEdit.classList.remove("hidden");
  showView("clientes-view");
}

function fillProcedureForm(item) {
  $("#procedure-id").value = item.id;
  $("#procedure-client").value = item.cliente_id || "";
  $("#procedure-name").value = item.procedimento || "";
  $("#procedure-date").value = item.data || todayISO();
  $("#procedure-value").value = item.valor || "";
  $("#procedure-cost").value = item.custo_estimado || "";
  $("#procedure-finance-category").value = item.categoria_financeira || "Procedimento";
  $("#procedure-generate-revenue").checked = Boolean(item.receita_id || item.gerar_receita_financeiro);
  $("#procedure-payment-method").value = item.forma_pagamento || "Pix";
  $("#procedure-payment-status").value = item.status_pagamento || "Recebido";
  $("#procedure-notes").value = item.observacoes || "";
  $("#procedure-form-title").textContent = "Editar procedimento";
  cancelProcedureEdit.classList.remove("hidden");
  showView("procedimentos-view");
}

function fillRevenueForm(item) {
  $("#revenue-id").value = item.id;
  $("#revenue-client").value = item.cliente_id || "";
  $("#revenue-procedure").value = item.procedimento_id || "";
  $("#revenue-type").value = item.tipo || "Procedimento";
  $("#revenue-description").value = item.descricao || "";
  $("#revenue-date").value = item.data || todayISO();
  $("#revenue-value").value = item.valor || "";
  $("#revenue-payment-method").value = item.forma_pagamento || "Pix";
  $("#revenue-status").value = item.status || "Recebido";
  $("#revenue-notes").value = item.observacoes || "";
  $("#revenue-form-title").textContent = "Editar receita";
  $("#cancel-revenue-edit").classList.remove("hidden");
  showView("financeiro-view");
  showFinanceTab("finance-revenues-tab");
}

function fillExpenseForm(item) {
  $("#expense-id").value = item.id;
  $("#expense-description").value = item.descricao || "";
  $("#expense-category").value = item.categoria || "";
  $("#expense-type").value = item.tipo || "Variavel";
  $("#expense-date").value = item.data || todayISO();
  $("#expense-value").value = item.valor || "";
  $("#expense-status").value = item.status || "Pago";
  $("#expense-payment-method").value = item.forma_pagamento || "Pix";
  $("#expense-recurring").checked = Boolean(item.recorrente);
  $("#expense-periodicity").value = item.periodicidade || "";
  $("#expense-notes").value = item.observacoes || "";
  $("#expense-form-title").textContent = "Editar despesa";
  $("#cancel-expense-edit").classList.remove("hidden");
  showView("financeiro-view");
  showFinanceTab("finance-expenses-tab");
}

function fillInvestmentForm(item) {
  $("#investment-id").value = item.id;
  $("#investment-description").value = item.descricao || "";
  $("#investment-category").value = item.categoria || "";
  $("#investment-date").value = item.data_compra || todayISO();
  $("#investment-total-value").value = item.valor_total || "";
  $("#investment-payment-method").value = item.forma_pagamento || "Pix";
  $("#investment-status").value = item.status || "Pago";
  $("#investment-installments").value = item.quantidade_parcelas || 1;
  $("#investment-current-installment").value = item.parcela_atual || 1;
  $("#investment-installment-value").value = item.valor_parcela || "";
  $("#investment-consider-profit").checked = item.considerar_no_lucro !== false;
  $("#investment-notes").value = item.observacoes || "";
  $("#investment-form-title").textContent = "Editar investimento";
  $("#cancel-investment-edit").classList.remove("hidden");
  showView("financeiro-view");
  showFinanceTab("finance-investments-tab");
}

function fillCategoryForm(item) {
  $("#category-id").value = item.id;
  $("#category-name").value = item.nome || "";
  $("#category-type").value = item.tipo || "despesa";
  $("#category-form-title").textContent = "Editar categoria";
  $("#cancel-category-edit").classList.remove("hidden");
}

function resetClientForm() {
  clientForm.reset();
  $("#client-id").value = "";
  $("#client-form-title").textContent = "Novo cliente";
  clientMessage.textContent = "";
  clientMessage.classList.remove("success-message");
  cancelClientEdit.classList.add("hidden");
}

function resetProcedureForm() {
  procedureForm.reset();
  $("#procedure-id").value = "";
  $("#procedure-date").value = todayISO();
  $("#procedure-generate-revenue").checked = true;
  $("#procedure-form-title").textContent = "Novo procedimento";
  cancelProcedureEdit.classList.add("hidden");
}

function resetRevenueForm() {
  revenueForm.reset();
  $("#revenue-id").value = "";
  $("#revenue-date").value = todayISO();
  $("#revenue-form-title").textContent = "Nova receita";
  $("#cancel-revenue-edit").classList.add("hidden");
}

function resetExpenseForm() {
  expenseForm.reset();
  $("#expense-id").value = "";
  $("#expense-date").value = todayISO();
  $("#expense-form-title").textContent = "Nova despesa";
  $("#cancel-expense-edit").classList.add("hidden");
}

function resetInvestmentForm() {
  investmentForm.reset();
  $("#investment-id").value = "";
  $("#investment-date").value = todayISO();
  $("#investment-installments").value = 1;
  $("#investment-current-installment").value = 1;
  $("#investment-consider-profit").checked = true;
  $("#investment-form-title").textContent = "Novo investimento";
  $("#cancel-investment-edit").classList.add("hidden");
}

function resetCategoryForm() {
  categoryForm.reset();
  $("#category-id").value = "";
  $("#category-form-title").textContent = "Nova categoria";
  $("#cancel-category-edit").classList.add("hidden");
}

function revenueCard(item) {
  return `
    <article class="record-card">
      <header>
        <div>
          <strong>${escapeHTML(item.descricao)}</strong>
          <div class="record-meta">
            <span>${clientName(item.cliente_id)}</span>
            <span>${formatDate(item.data)}</span>
            <span>${formatMoney(item.valor)}</span>
            <span>${escapeHTML(item.forma_pagamento || "")}</span>
            <span class="tag ${statusClass(item.status)}">${escapeHTML(item.status || "")}</span>
          </div>
        </div>
      </header>
      ${item.observacoes ? `<p>${escapeHTML(item.observacoes)}</p>` : ""}
      <div class="record-actions">
        <button class="button subtle" type="button" data-action="edit-revenue" data-id="${item.id}">Editar</button>
        <button class="button danger" type="button" data-action="delete-revenue" data-id="${item.id}">Excluir</button>
      </div>
    </article>
  `;
}

function expenseCard(item) {
  return `
    <article class="record-card">
      <header>
        <div>
          <strong>${escapeHTML(item.descricao)}</strong>
          <div class="record-meta">
            <span>${formatDate(item.data)}</span>
            <span>${formatMoney(item.valor)}</span>
            <span>${escapeHTML(item.categoria || "")}</span>
            <span>${escapeHTML(item.tipo || "")}</span>
            <span class="tag ${statusClass(item.status)}">${escapeHTML(item.status || "")}</span>
          </div>
        </div>
      </header>
      ${item.recorrente ? `<div class="record-meta"><span>Recorrente: ${escapeHTML(item.periodicidade || "")}</span></div>` : ""}
      ${item.observacoes ? `<p>${escapeHTML(item.observacoes)}</p>` : ""}
      <div class="record-actions">
        <button class="button subtle" type="button" data-action="edit-expense" data-id="${item.id}">Editar</button>
        <button class="button danger" type="button" data-action="delete-expense" data-id="${item.id}">Excluir</button>
      </div>
    </article>
  `;
}

function investmentCard(item) {
  const { start, end } = selectedFinancePeriod();
  return `
    <article class="record-card">
      <header>
        <div>
          <strong>${escapeHTML(item.descricao)}</strong>
          <div class="record-meta">
            <span>${formatDate(item.data_compra)}</span>
            <span>Total: ${formatMoney(item.valor_total)}</span>
            <span>No periodo: ${formatMoney(investmentPeriodValue(item, start, end))}</span>
            <span>${escapeHTML(item.categoria || "")}</span>
            <span class="tag ${statusClass(item.status)}">${escapeHTML(item.status || "")}</span>
          </div>
        </div>
      </header>
      <div class="record-meta">
        <span>Parcelas: ${Number(item.parcela_atual || 1)}/${Number(item.quantidade_parcelas || 1)}</span>
        <span>${item.considerar_no_lucro === false ? "Nao entra no lucro" : "Entra no lucro"}</span>
      </div>
      ${item.observacoes ? `<p>${escapeHTML(item.observacoes)}</p>` : ""}
      <div class="record-actions">
        ${item.status !== "Pago" ? `<button class="button ghost" type="button" data-action="mark-investment-paid" data-id="${item.id}">Marcar pago</button>` : ""}
        <button class="button subtle" type="button" data-action="edit-investment" data-id="${item.id}">Editar</button>
        <button class="button danger" type="button" data-action="delete-investment" data-id="${item.id}">Excluir</button>
      </div>
    </article>
  `;
}

function notificationCard(item) {
  const cliente = getClientById(item.cliente_id);
  return `
    <article class="record-card">
      <header>
        <div>
          <strong>${escapeHTML(item.tipo)}</strong>
          <div class="record-meta">
            <span>${escapeHTML(cliente?.nome || "Cliente removido")}</span>
            <span>${formatDate(item.data_aviso)}</span>
            <span class="tag ${item.status === "pendente" ? "warning" : "success"}">${escapeHTML(item.status)}</span>
          </div>
        </div>
      </header>
      <p>${escapeHTML(item.mensagem)}</p>
      <div class="notification-actions">
        ${cliente?.telefone ? `<button class="button ghost" type="button" data-action="whatsapp-notification" data-id="${item.id}">Enviar WhatsApp</button>` : ""}
        ${item.status !== "resolvido" ? `<button class="button subtle" type="button" data-action="resolve-notification" data-id="${item.id}">Marcar como resolvida</button>` : ""}
      </div>
    </article>
  `;
}

function renderProcedureReport(start, end) {
  const grouped = {};
  state.receitas
    .filter((item) => item.status === "Recebido" && inDateRange(item.data, start, end) && (item.tipo === "Procedimento" || item.procedimento_id))
    .forEach((item) => {
      const procedure = getProcedureById(item.procedimento_id);
      const name = item.descricao || procedure?.procedimento || "Procedimento";
      if (!grouped[name]) grouped[name] = { quantity: 0, revenue: 0, cost: 0 };
      grouped[name].quantity += 1;
      grouped[name].revenue += Number(item.valor || 0);
      grouped[name].cost += Number(procedure?.custo_estimado || 0);
    });

  const cards = Object.entries(grouped).map(([name, item]) => {
    const profit = item.revenue - item.cost;
    return summaryCard(
      name,
      `Quantidade: ${item.quantity} | Receita: ${formatMoney(item.revenue)} | Media: ${formatMoney(item.revenue / item.quantity)} | Lucro estimado: ${formatMoney(profit)}`,
      profit >= 0 ? "success" : "danger"
    );
  });
  $("#procedure-report").innerHTML = cards.join("") || `<span class="empty-state">Nenhuma receita de procedimento no periodo.</span>`;
}

function renderPaymentReport(start, end) {
  const grouped = groupSum(
    state.receitas.filter((item) => item.status === "Recebido" && inDateRange(item.data, start, end)),
    "forma_pagamento",
    "valor"
  );
  renderBars("#payment-report", Object.entries(grouped).map(([label, value]) => ({ label, value, variant: "income" })));
}

function renderExpenseCategoryReport(start, end) {
  const grouped = groupSum(
    state.despesas.filter((item) => item.status === "Pago" && inDateRange(item.data, start, end)),
    "categoria",
    "valor"
  );
  renderBars("#expense-category-report", Object.entries(grouped).map(([label, value]) => ({ label, value, variant: "expense" })));
}

function renderInvestmentReport(start, end) {
  const rows = state.investimentos
    .filter((item) => investmentTouchesPeriod(item, start, end))
    .map((item) => {
      const remaining = Math.max(0, Number(item.quantidade_parcelas || 1) - Number(item.parcela_atual || 1));
      return `
        <article class="record-card">
          <header>
            <div>
              <strong>${escapeHTML(item.descricao)}</strong>
              <div class="record-meta">
                <span>Total: ${formatMoney(item.valor_total)}</span>
                <span>Pago no periodo: ${formatMoney(investmentPeriodValue(item, start, end))}</span>
                <span>Parcelas restantes: ${remaining}</span>
                <span class="tag ${statusClass(item.status)}">${escapeHTML(item.status || "")}</span>
              </div>
            </div>
          </header>
        </article>
      `;
    });
  $("#investment-report").innerHTML = rows.join("") || `<span class="empty-state">Nenhum investimento no periodo.</span>`;
}

function renderBars(selector, items) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const cards = items
    .filter((item) => item.value > 0)
    .map(
      (item) => `
        <article class="bar-card">
          <header>
            <strong>${escapeHTML(item.label || "Sem categoria")}</strong>
            <span>${formatMoney(item.value)}</span>
          </header>
          <div class="bar-track"><div class="bar-fill ${item.variant || ""}" style="--bar-width: ${(item.value / max) * 100}%"></div></div>
        </article>
      `
    );
  $(selector).innerHTML = cards.join("") || `<span class="empty-state">Sem dados para exibir.</span>`;
}

function exportFinanceCSV() {
  const { start, end } = selectedFinancePeriod();
  const rows = [
    ["Data", "Tipo", "Categoria", "Descricao", "Cliente", "Valor", "Status", "Forma de pagamento", "Observacoes"],
    ...state.receitas
      .filter((item) => inDateRange(item.data, start, end))
      .map((item) => [item.data, "Receita", item.tipo, item.descricao, clientName(item.cliente_id), item.valor, item.status, item.forma_pagamento, item.observacoes]),
    ...state.despesas
      .filter((item) => inDateRange(item.data, start, end))
      .map((item) => [item.data, "Despesa", item.categoria, item.descricao, "", item.valor, item.status, item.forma_pagamento, item.observacoes]),
    ...state.investimentos
      .filter((item) => investmentTouchesPeriod(item, start, end))
      .map((item) => [
        item.data_compra,
        "Investimento",
        item.categoria,
        item.descricao,
        "",
        investmentPeriodValue(item, start, end),
        item.status,
        item.forma_pagamento,
        item.observacoes
      ])
  ];

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `financeiro-${start}-a-${end}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function syncInstallmentValue() {
  const total = toNumber($("#investment-total-value").value);
  const installments = Math.max(1, Number($("#investment-installments").value || 1));
  $("#investment-installment-value").value = total ? (total / installments).toFixed(2) : "";
}

function categoryOptions(type) {
  const custom = state.categorias.filter((item) => item.tipo === type).map((item) => item.nome);
  const names = [...new Set([...(DEFAULT_CATEGORIES[type] || []), ...custom])];
  return names.map((name) => ({ value: name, label: name }));
}

function getClientById(id) {
  return state.clientes.find((cliente) => cliente.id === id);
}

function getProcedureById(id) {
  return state.procedimentos.find((item) => item.id === id);
}

function getFinanceById(name, id) {
  return state[name].find((item) => item.id === id);
}

function clientName(id) {
  return getClientById(id)?.nome || "Sem cliente";
}

function isSkinCleaning(value = "") {
  return value.trim().toLowerCase() === "limpeza de pele";
}

function todayISO() {
  return dateToISO(new Date());
}

function dateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateToISO(date);
}

function monthRange(dateString) {
  const [year, month] = dateString.split("-").map(Number);
  return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: dateToISO(new Date(year, month, 0)) };
}

function previousMonthRange(dateString) {
  const [year, month] = dateString.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return monthRange(dateToISO(date));
}

function weekRange(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: dateToISO(start), end: dateToISO(end) };
}

function inDateRange(date, start, end) {
  return Boolean(date && date >= start && date <= end);
}

function isSameMonthDay(dateA, dateB) {
  return Boolean(dateA && dateB && dateA.slice(5) === dateB.slice(5));
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function toNumber(value) {
  if (typeof value === "number") return value;
  return Number(String(value || "0").replace(/\./g, "").replace(",", ".")) || 0;
}

function sumBy(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function groupSum(items, groupKey, valueKey) {
  return items.reduce((acc, item) => {
    const key = item[groupKey] || "Outro";
    acc[key] = (acc[key] || 0) + Number(item[valueKey] || 0);
    return acc;
  }, {});
}

function firstName(name = "") {
  return name.trim().split(" ")[0] || "cliente";
}

function openWhatsApp(cliente, message) {
  const number = onlyDigits(cliente?.telefone || "");
  if (!number) {
    alert("Cliente sem WhatsApp cadastrado.");
    return;
  }

  window.open(`https://wa.me/55${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function whatsappMessageForNotification(cliente, notificacao) {
  if (notificacao.tipo === "Retorno de limpeza") {
    return `Ola ${firstName(cliente?.nome)}! Ja faz 30 dias da sua limpeza de pele. Gostaria de agendar sua manutencao?`;
  }

  return notificacao.mensagem;
}

function summaryCard(title, text, variant) {
  return `
    <article class="summary-card">
      <header>
        <strong>${escapeHTML(title)}</strong>
        <span class="tag ${variant}">Hoje</span>
      </header>
      <span>${escapeHTML(text)}</span>
    </article>
  `;
}

function reportLine(label, value) {
  return `
    <article class="summary-card">
      <header>
        <strong>${escapeHTML(label)}</strong>
        <span>${escapeHTML(value)}</span>
      </header>
    </article>
  `;
}

function statusClass(status) {
  if (["Recebido", "Pago"].includes(status)) return "success";
  if (["Pendente", "Parcelado"].includes(status)) return "warning";
  if (status === "Cancelado") return "danger";
  return "";
}

function categoryTypeLabel(type) {
  return { receita: "Receita", despesa: "Despesa", investimento: "Investimento" }[type] || type;
}

function csvCell(value = "") {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail ja esta cadastrado.",
    "auth/invalid-email": "Digite um e-mail valido.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres."
  };

  return messages[error.code] || "Nao foi possivel concluir. Verifique os dados e tente novamente.";
}

function firestoreErrorMessage(error, fallback) {
  const messages = {
    "permission-denied":
      "Permissao negada no Firebase. Revise as regras do Firestore para permitir acesso em users/{uid} e subcolecoes.",
    unauthenticated: "Sessao expirada. Saia e entre novamente para salvar os dados.",
    unavailable: "Firebase indisponivel no momento. Verifique a internet e tente de novo."
  };

  return messages[error.code] || `${fallback} Detalhe: ${error.message || error.code || "erro desconhecido"}`;
}

function showDataLoadError(error) {
  const message = firestoreErrorMessage(error, "Nao foi possivel carregar os dados.");
  const clientsList = $("#clients-list");
  if (clientsList) {
    clientsList.textContent = message;
    clientsList.classList.add("empty-state");
  }
  if (clientMessage) {
    clientMessage.textContent = message;
    clientMessage.classList.remove("success-message");
  }
}

resetProcedureForm();
resetRevenueForm();
resetExpenseForm();
resetInvestmentForm();
