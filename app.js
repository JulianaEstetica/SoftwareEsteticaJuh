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

const state = {
  uid: null,
  clientes: [],
  procedimentos: [],
  notificacoes: [],
  unsubscribers: []
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
const procedureForm = $("#procedure-form");
const notificationFilter = $("#notification-filter");

const pathFor = (name) => collection(db, "users", state.uid, name);
const docFor = (name, id) => doc(db, "users", state.uid, name, id);

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
  } catch (error) {
    authMessage.textContent = friendlyAuthError(error);
  }
});

logoutButton.addEventListener("click", () => signOut(auth));

mobileMenuButton.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

$$(".nav-link").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

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
    await updateDoc(docFor("clientes", id), payload);
  } else {
    const docRef = await addDoc(pathFor("clientes"), {
      ...payload,
      data_cadastro: todayISO(),
      criado_em: serverTimestamp()
    });
    await updateDoc(docRef, { id: docRef.id });
  }

  resetClientForm();
});

cancelClientEdit.addEventListener("click", resetClientForm);
clientSearch.addEventListener("input", renderClients);
notificationFilter.addEventListener("change", renderNotifications);

procedureForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const clienteId = $("#procedure-client").value;
  const cliente = getClientById(clienteId);
  const procedimento = $("#procedure-name").value.trim();
  const data = $("#procedure-date").value;
  const valor = Number($("#procedure-value").value || 0);
  const observacoes = $("#procedure-notes").value.trim();

  const docRef = await addDoc(pathFor("procedimentos"), {
    cliente_id: clienteId,
    procedimento,
    data,
    valor,
    observacoes,
    criado_em: serverTimestamp()
  });
  await updateDoc(docRef, { id: docRef.id });

  const clientUpdate = {
    ultimo_procedimento: procedimento
  };

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
  procedureForm.reset();
  $("#procedure-date").value = todayISO();
});

function subscribeToData() {
  const clientesQuery = query(pathFor("clientes"), orderBy("nome"));
  const procedimentosQuery = query(pathFor("procedimentos"), orderBy("data", "desc"));
  const notificacoesQuery = query(pathFor("notificacoes"), orderBy("data_aviso", "desc"));

  state.unsubscribers = [
    onSnapshot(clientesQuery, (snapshot) => {
      state.clientes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }),
    onSnapshot(procedimentosQuery, (snapshot) => {
      state.procedimentos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }),
    onSnapshot(notificacoesQuery, (snapshot) => {
      state.notificacoes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    })
  ];
}

function clearSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  state.clientes = [];
  state.procedimentos = [];
  state.notificacoes = [];
}

function renderAll() {
  renderDashboard();
  renderClients();
  renderClientOptions();
  renderProcedures();
  renderNotifications();
}

function renderDashboard() {
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const birthdaysToday = state.clientes.filter((cliente) => isSameMonthDay(cliente.nascimento, today));
  const returnsToday = state.notificacoes.filter(
    (item) => item.tipo === "Retorno de limpeza" && item.data_aviso === today && item.status === "pendente"
  );
  const cleaningsThisMonth = state.procedimentos.filter(
    (item) => isSkinCleaning(item.procedimento) && item.data?.startsWith(currentMonth)
  );
  const pendingNotifications = state.notificacoes.filter((item) => item.status === "pendente");

  $("#metric-total-clientes").textContent = state.clientes.length;
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
  $("#procedure-client").innerHTML =
    state.clientes.map((cliente) => `<option value="${cliente.id}">${escapeHTML(cliente.nome)}</option>`).join("") ||
    `<option value="">Cadastre um cliente primeiro</option>`;
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
                </div>
              </div>
              ${isSkinCleaning(item.procedimento) ? '<span class="tag success">Retorno automatico</span>' : ""}
            </header>
            ${item.observacoes ? `<p>${escapeHTML(item.observacoes)}</p>` : ""}
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
    notificacoes
      .map((item) => {
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
              ${
                cliente?.telefone
                  ? `<button class="button ghost" type="button" data-action="whatsapp-notification" data-id="${item.id}">Enviar WhatsApp</button>`
                  : ""
              }
              ${
                item.status !== "resolvido"
                  ? `<button class="button subtle" type="button" data-action="resolve-notification" data-id="${item.id}">Marcar como resolvida</button>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("") || "Nenhuma notificacao encontrada.";

  $("#notifications-list").classList.toggle("empty-state", notificacoes.length === 0);
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit-client") {
    fillClientForm(getClientById(id));
  }

  if (action === "delete-client" && confirm("Excluir este cliente?")) {
    await deleteDoc(docFor("clientes", id));
  }

  if (action === "whatsapp-client") {
    const cliente = getClientById(id);
    openWhatsApp(cliente, `Ola ${firstName(cliente.nome)}! Tudo bem?`);
  }

  if (action === "whatsapp-notification") {
    const notificacao = state.notificacoes.find((item) => item.id === id);
    const cliente = getClientById(notificacao.cliente_id);
    openWhatsApp(cliente, whatsappMessageForNotification(cliente, notificacao));
  }

  if (action === "resolve-notification") {
    await updateDoc(docFor("notificacoes", id), { status: "resolvido" });
  }
});

function showView(viewId) {
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $("#view-title").textContent = document.querySelector(`[data-view="${viewId}"]`).textContent;
  sidebar.classList.remove("open");
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

function resetClientForm() {
  clientForm.reset();
  $("#client-id").value = "";
  $("#client-form-title").textContent = "Novo cliente";
  cancelClientEdit.classList.add("hidden");
}

function getClientById(id) {
  return state.clientes.find((cliente) => cliente.id === id);
}

function isSkinCleaning(value = "") {
  return value.trim().toLowerCase() === "limpeza de pele";
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");
  return `${newYear}-${newMonth}-${newDay}`;
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
    return `Ola ${firstName(cliente.nome)}! Ja faz 30 dias da sua limpeza de pele. Gostaria de agendar sua manutencao?`;
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

$("#procedure-date").value = todayISO();
