import { expect, request as playwrightRequest, test } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "mgusev";
const adminPassword = process.env.ADMIN_PASSWORD || "passwb121";
const demoUsername = process.env.DEMO_USERNAME || "demo";
const demoPassword = process.env.DEMO_PASSWORD || "demo";

test("auth, admin workflow, and employee data isolation work", async ({ page, request }) => {
  test.setTimeout(120_000);

  const unauthenticated = await request.get(`${baseURL}/api/workspace`);
  expect(unauthenticated.status()).toBe(401);
  const malformedJson = await request.post(`${baseURL}/api/login`, {
    headers: { "Content-Type": "text/plain" },
    data: "{bad"
  });
  expect(malformedJson.status()).toBe(400);

  const resetContext = await playwrightRequest.newContext({ baseURL });
  await resetContext.post("/api/login", {
    data: { username: adminUsername, password: adminPassword }
  });
  await resetContext.post("/api/reset");
  await resetContext.dispose();

  await page.goto(baseURL);
  await expect(page.getByRole("heading", { name: "Войти в Team Health 1:1" })).toBeVisible();

  await page.getByLabel("Логин").fill(adminUsername);
  await page.getByLabel("Пароль").fill(adminPassword);
  await page.getByRole("button", { name: "Войти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Дашборд команды" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Команда пока пустая" })).toBeVisible();
  await expect(page.getByText("Добавьте участников и логины")).toBeVisible();
  await expect(page.getByText("Как этим пользоваться")).not.toBeVisible();
  await expect(page.getByText("Демо участник команды")).not.toBeVisible();
  await expect(page.getByText("Анна Морозова")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Сбросить демо-данные" })).not.toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Сбросить демо-данные" }).click();
  await expect(page.getByText("Демо-данные сброшены. Вы остались в аккаунте админа")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Команда", exact: true })).toBeVisible();
  await expect(page.getByText("Демо участник команды")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Войти в Team Health 1:1" })).not.toBeVisible();

  await expect(page.getByRole("button", { name: "Люди", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Пользователи", exact: true })).not.toBeVisible();
  await expect(page.locator(".context-sidebar")).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Команда" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Участники 1:1" })).toBeVisible();
  await expect(page.getByText("В рабочей команде пока нет участников 1:1")).toBeVisible();
  await page.getByRole("button", { name: "Создать логин", exact: true }).click();
  await expect(page.locator("#team-create-login-panel").getByRole("heading", { name: "Создать логин" })).toBeVisible();
  await page.getByRole("button", { name: "Скрыть форму", exact: true }).click();
  await expect(page.locator("#team-create-login-panel")).not.toBeVisible();
  await expect(page.getByText("seed")).not.toBeVisible();

  // Profile name editing moved to Настройки
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const leaderForm = page.locator(".settings-card").filter({ hasText: "Как вас зовут" });
  await leaderForm.getByLabel("Имя").fill("Максим Гусев QA");
  await leaderForm.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Вы вошли как Максим Гусев QA · Админ платформы")).toBeVisible();

  const employeeName = "Игорь Сидоров";
  const employeeUsername = `igor_${Date.now()}`;
  const employeePassword = "TeamPass121";
  const updatedEmployeePassword = "TeamPass122";

  // Create login is available directly from the home empty state.
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await page.getByRole("button", { name: "Создать логин", exact: true }).click();
  const accessForm = page.locator("#home-create-login-panel");
  await expect(accessForm.getByRole("heading", { name: "Создать логин" })).toBeVisible();

  await accessForm.getByLabel("Имя участника").fill(employeeName);
  await accessForm.getByLabel(/Роль в команде/).fill("Product Manager");
  await accessForm.getByLabel("Команда").fill("Product Growth");
  await accessForm.getByLabel("Логин").fill(employeeUsername);
  await accessForm.getByLabel("Пароль").fill(employeePassword);
  await accessForm.getByRole("button", { name: "Создать логин" }).click();
  await expect(page.getByText(`Логин ${employeeUsername} создан`)).toBeVisible();
  await page.getByRole("button", { name: "Команда", exact: true }).click();
  await expect(page.locator(".team-member-card", { hasText: employeeName })).toBeVisible();
  await expect(page.getByText("Демо участник команды")).not.toBeVisible();

  await page.locator(".team-member-card", { hasText: employeeName }).locator(".team-member-main").click();
  await expect(page.getByRole("heading", { name: `1:1 с ${employeeName}` })).toBeVisible();
  await expect(page.getByText("Чек-лист подготовки")).toBeVisible();

  await page.getByPlaceholder("Например: слишком много срочных запросов").fill("Проверить баланс фокуса и срочных запросов");
  await page.getByPlaceholder("Что важно не забыть обсудить?").fill("Сколько deep work блоков реально остается после встреч и переключений?");
  await page.getByTitle("Добавить тему").click();
  await expect(page.getByRole("heading", { name: "Проверить баланс фокуса и срочных запросов" })).toBeVisible();
  const createdAgendaCard = page.locator(".agenda-card", { hasText: "Проверить баланс фокуса и срочных запросов" });
  await createdAgendaCard.getByRole("button", { name: "Добавить в шаги" }).click();
  await expect(createdAgendaCard.getByRole("button", { name: "Уже в шагах" })).toBeDisabled();

  await page.getByRole("tab", { name: /Встреча/ }).click();
  await expect(page.getByRole("heading", { name: "Сигналы между встречами" })).toBeVisible();
  await page.locator(".signal-control").filter({ hasText: "Нагрузка" }).locator("input").fill("8");
  const meetingProtocolText = "Участник просит оставить только два главных приоритета до следующего 1:1.";
  await page.getByPlaceholder("Ключевые цитаты, решения, контекст и открытые вопросы.").fill(meetingProtocolText);

  await page.getByRole("tab", { name: /Итоги/ }).click();
  await expect(page.locator(".action-row strong", { hasText: "Проверить баланс фокуса и срочных запросов" })).toHaveCount(1);
  await page.getByPlaceholder("Что нужно сделать?").fill("Проверить баланс фокуса и срочных запросов");
  await expect(page.getByRole("button", { name: "Добавить шаг" })).toBeDisabled();
  await page.getByPlaceholder("Что нужно сделать?").fill("Забронировать два окна фокуса после блока встреч");
  await expect(page.getByRole("button", { name: "Добавить шаг" })).toBeEnabled();
  await page.getByRole("button", { name: "Добавить шаг" }).click();
  await expect(page.locator(".action-row strong", { hasText: "Забронировать два окна фокуса после блока встреч" })).toBeVisible();

  await page.getByRole("tab", { name: /Подготовка/ }).click();
  await page.getByRole("button", { name: "Итоги встречи" }).click();
  await expect(page.getByRole("tab", { name: /Итоги/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(`Итоги 1:1 с ${employeeName}`)).toBeVisible();
  await expect(page.locator(".summary-panel textarea")).toHaveValue(new RegExp(meetingProtocolText));

  // Password reset moved to Админка
  await page.getByRole("button", { name: "Админка", exact: true }).click();
  const resetPasswordForm = page.locator(".settings-card").filter({ hasText: "Сбросить пароль" });
  const optionValue = await resetPasswordForm
    .locator("select option")
    .filter({ hasText: employeeUsername })
    .first()
    .getAttribute("value");
  await resetPasswordForm.locator("select").selectOption(optionValue);
  await resetPasswordForm.locator("input[type=password]").fill(updatedEmployeePassword);
  await resetPasswordForm.getByRole("button", { name: "Сбросить пароль" }).click();
  await expect(page.getByText("Пароль обновлен, активные сессии пользователя закрыты")).toBeVisible();

  const employeeApi = await playwrightRequest.newContext({ baseURL });
  const employeeLogin = await employeeApi.post("/api/login", {
    data: { username: employeeUsername, password: updatedEmployeePassword }
  });
  expect(employeeLogin.status()).toBe(200);

  const employeeWorkspace = await employeeApi.get("/api/workspace");
  expect(employeeWorkspace.status()).toBe(200);
  const scoped = await employeeWorkspace.json();
  expect(scoped.people).toHaveLength(1);
  expect(scoped.people[0].name).toBe(employeeName);
  expect(scoped.cards.every((card) => card.personId === scoped.people[0].id)).toBeTruthy();
  expect(scoped.users).toEqual([]);
  expect(scoped.notes).toEqual({});
  const employeeProtocol = "Мой протокол виден только моему 1:1.";
  const protocolUpdate = await employeeApi.post("/api/workspace", {
    data: {
      ...scoped,
      meetingDrafts: {
        [scoped.people[0].id]: employeeProtocol,
        "not-my-person": "не должно сохраниться"
      }
    }
  });
  expect(protocolUpdate.status()).toBe(200);
  const protocolScoped = await protocolUpdate.json();
  expect(protocolScoped.meetingDrafts).toEqual({ [scoped.people[0].id]: employeeProtocol });
  const meetingStateProtocol = "Протокол сохранен через узкий meeting-state API.";
  const meetingStateUpdate = await employeeApi.patch(`/api/people/${encodeURIComponent(scoped.people[0].id)}/meeting-state`, {
    data: {
      prep: {
        employeeAgenda: true,
        managerAgenda: true
      },
      pulse: {
        load: 9,
        trust: 8
      },
      meetingDraft: meetingStateProtocol
    }
  });
  expect(meetingStateUpdate.status()).toBe(200);
  const meetingStateScoped = await meetingStateUpdate.json();
  expect(meetingStateScoped.workspace.prep[scoped.people[0].id]).toEqual(expect.objectContaining({
    employeeAgenda: true,
    managerAgenda: false
  }));
  expect(meetingStateScoped.workspace.pulse[scoped.people[0].id]).toEqual(expect.objectContaining({
    load: 9,
    trust: 8
  }));
  expect(meetingStateScoped.workspace.meetingDrafts).toEqual({ [scoped.people[0].id]: meetingStateProtocol });
  const forbiddenMeetingState = await employeeApi.patch("/api/people/not-my-person/meeting-state", {
    data: { meetingDraft: "чужой протокол" }
  });
  expect(forbiddenMeetingState.status()).toBe(404);
  await employeeApi.dispose();

  const demoApi = await playwrightRequest.newContext({ baseURL });
  const demoLogin = await demoApi.post("/api/login", {
    data: { username: demoUsername, password: demoPassword }
  });
  expect(demoLogin.status()).toBe(200);
  const demoWorkspace = await demoApi.get("/api/workspace");
  const demoScoped = await demoWorkspace.json();
  expect(demoScoped.people).toHaveLength(1);
  expect(demoScoped.people[0].id).toBe("demo-sre");
  expect(demoScoped.lprs).toEqual([expect.objectContaining({ id: "lpr-demo-1", personId: "demo-sre" })]);
  expect(demoScoped.cards.every((card) => card.personId === "demo-sre")).toBeTruthy();
  expect(demoScoped.goals.filter((goal) => goal.id.startsWith("g-demo-")).every((goal) => goal.lprId === "lpr-demo-1")).toBeTruthy();
  const tamperedDemoWorkspace = await demoApi.post("/api/workspace", {
    data: {
      ...demoScoped,
      prep: {
        "demo-sre": {
          managerAgenda: false,
          employeeAgenda: false
        }
      },
      pulse: {
        "demo-sre": {
          energy: 99,
          load: -4,
          clarity: "bad",
          trust: 0
        }
      }
    }
  });
  expect(tamperedDemoWorkspace.status()).toBe(200);
  const sanitizedDemoScoped = await tamperedDemoWorkspace.json();
  expect(sanitizedDemoScoped.prep["demo-sre"].managerAgenda).toBe(true);
  expect(sanitizedDemoScoped.prep["demo-sre"].employeeAgenda).toBe(false);
  expect(sanitizedDemoScoped.pulse["demo-sre"]).toEqual({
    energy: 10,
    load: 1,
    clarity: 7,
    trust: 1
  });
  await demoApi.dispose();

  // Delete the login from Админка
  await page.getByRole("button", { name: "Админка", exact: true }).click();
  const createdAccessRow = page.locator(".admin-view .access-row", { hasText: employeeUsername });
  await createdAccessRow.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(`Логин ${employeeUsername} удален`)).toBeVisible();
  await expect(createdAccessRow).not.toBeVisible();

  // Now delete the person from Команда
  await page.getByRole("button", { name: "Команда", exact: true }).click();
  await page.locator(".team-member-card", { hasText: employeeName }).getByRole("button", { name: "Удалить участника" }).click();
  await expect(page.getByText(`Подтвердите удаление ${employeeName}`)).toBeVisible();
  await page.locator(".team-member-card", { hasText: employeeName }).getByRole("button", { name: "Подтвердить удаление" }).click();
  await expect(page.getByText(`Участник ${employeeName} удален`)).toBeVisible();
  await expect(page.locator(".team-member-card", { hasText: employeeName })).not.toBeVisible();

  const deletedEmployeeApi = await playwrightRequest.newContext({ baseURL });
  const deletedEmployeeLogin = await deletedEmployeeApi.post("/api/login", {
    data: { username: employeeUsername, password: updatedEmployeePassword }
  });
  expect(deletedEmployeeLogin.status()).toBe(401);
  await deletedEmployeeApi.dispose();

  const adminApi = await playwrightRequest.newContext({ baseURL });
  await adminApi.post("/api/login", {
    data: { username: adminUsername, password: adminPassword }
  });

  const suffix = Date.now();
  const leadAPassword = "TeamPass121";
  const leadAResponse = await adminApi.post("/api/users", {
    data: {
      role: "lead",
      name: "Лид Core",
      personName: "Лид Core",
      personTeam: "Core Platform",
      teamLabel: "Core Platform",
      username: `lead_core_${suffix}`,
      password: leadAPassword
    }
  });
  expect(leadAResponse.status()).toBe(201);
  const leadA = (await leadAResponse.json()).user;

  const memberAResponse = await adminApi.post("/api/users", {
    data: {
      role: "employee",
      personName: "Участник Core",
      personRole: "Product Manager",
      personTeam: "Core Platform",
      leadUserId: leadA.id,
      username: `member_core_${suffix}`,
      password: "TeamPass121"
    }
  });
  expect(memberAResponse.status()).toBe(201);
  const memberA = (await memberAResponse.json()).user;

  const leadBResponse = await adminApi.post("/api/users", {
    data: {
      role: "lead",
      name: "Лид Data",
      personName: "Лид Data",
      personTeam: "Core Platform",
      teamLabel: "Core Platform",
      username: `lead_data_${suffix}`,
      password: "TeamPass121"
    }
  });
  expect(leadBResponse.status()).toBe(201);
  const leadB = (await leadBResponse.json()).user;

  const memberBResponse = await adminApi.post("/api/users", {
    data: {
      role: "employee",
      personName: "Участник Data",
      personRole: "Support Specialist",
      personTeam: "Core Platform",
      leadUserId: leadB.id,
      username: `member_data_${suffix}`,
      password: "TeamPass121"
    }
  });
  expect(memberBResponse.status()).toBe(201);
  const memberB = (await memberBResponse.json()).user;
  await adminApi.dispose();

  const leadApi = await playwrightRequest.newContext({ baseURL });
  const leadLogin = await leadApi.post("/api/login", {
    data: { username: leadA.username, password: leadAPassword }
  });
  expect(leadLogin.status()).toBe(200);
  const leadWorkspaceResponse = await leadApi.get("/api/workspace");
  expect(leadWorkspaceResponse.status()).toBe(200);
  const leadWorkspace = await leadWorkspaceResponse.json();
  expect(leadWorkspace.people.map((person) => person.name)).toEqual(["Участник Core"]);
  expect(leadWorkspace.users.map((item) => item.username).sort()).toEqual([leadA.username, `member_core_${suffix}`].sort());
  expect(leadWorkspace.people.some((person) => person.id === memberB.personId)).toBeFalsy();

  const leadCreatedUsername = `member_by_lead_${suffix}`;
  const leadCreatedResponse = await leadApi.post("/api/users", {
    data: {
      role: "employee",
      personName: "Участник от лида",
      personRole: "QA Engineer",
      personTeam: "Ignored Team",
      username: leadCreatedUsername,
      password: "TeamPass121"
    }
  });
  expect(leadCreatedResponse.status()).toBe(201);
  const leadCreated = (await leadCreatedResponse.json()).user;
  const leadCreateLeadResponse = await leadApi.post("/api/users", {
    data: {
      role: "lead",
      personName: "Нельзя создать лида",
      personTeam: "Core Platform",
      username: `lead_by_lead_${suffix}`,
      password: "TeamPass121"
    }
  });
  expect(leadCreateLeadResponse.status()).toBe(403);
  const leadWorkspaceAfterCreate = await (await leadApi.get("/api/workspace")).json();
  expect(leadWorkspaceAfterCreate.people.map((person) => person.name).sort()).toEqual(["Участник Core", "Участник от лида"].sort());
  expect(leadWorkspaceAfterCreate.users.map((item) => item.username)).toContain(leadCreatedUsername);

  const lpr = {
    id: `lpr-${suffix}`,
    personId: memberA.personId,
    title: "ЛПР: ownership",
    focus: "Связать темы 1:1 с измеримой целью",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const goal = {
    id: `goal-${suffix}`,
    personId: memberA.personId,
    lprId: lpr.id,
    title: "Закрыть ownership gap",
    description: "Сформулировано из ЛПР",
    horizon: "2026-Q2",
    progress: 10,
    status: "active",
    createdAt: new Date().toISOString(),
    dueDate: ""
  };
  const saveLeadWorkspace = await leadApi.post("/api/workspace", {
    data: {
      ...leadWorkspaceAfterCreate,
      lprs: [lpr],
      goals: [goal]
    }
  });
  expect(saveLeadWorkspace.status()).toBe(200);
  const savedLeadWorkspace = await saveLeadWorkspace.json();
  expect(savedLeadWorkspace.lprs).toEqual([expect.objectContaining({ id: lpr.id, personId: memberA.personId })]);
  expect(savedLeadWorkspace.goals).toEqual([expect.objectContaining({ id: goal.id, lprId: lpr.id })]);

  const competencyAssessment = {
    id: `assessment-${suffix}`,
    personId: memberA.personId,
    title: "Кейс-интервью Product Manager",
    roleContext: "Product Manager · Core Platform",
    source: "case-ai",
    status: "validated",
    scaleMax: 5,
    competencies: [
      {
        id: "competency-priority",
        name: "Приоритизация",
        category: "Execution",
        score: 4.5,
        targetScore: 4,
        evidence: "Сильный ответ по trade-off.",
        recommendation: "Закрепить практику письменного recap."
      },
      {
        id: "competency-diagnostics",
        name: "Системная диагностика",
        category: "Problem solving",
        score: 4,
        targetScore: 4,
        evidence: "Находит причинно-следственные связи.",
        recommendation: "Передавать подход коллегам."
      },
      {
        id: "competency-escalation",
        name: "Эскалация",
        category: "Collaboration",
        score: 2.5,
        targetScore: 3,
        evidence: "Не всегда прикладывает контекст решения.",
        recommendation: "Описывать критерии эскалации до передачи."
      }
    ],
    cases: [
      {
        id: "case-priority",
        title: "Три срочных запроса утром",
        summary: "Проверялись приоритизация и эскалация.",
        checkedCompetencies: ["Приоритизация", "Эскалация"]
      }
    ],
    recommendations: [
      {
        id: "recommendation-escalation",
        competencyName: "Эскалация",
        action: "Сформулировать чек-лист эскалации для команды.",
        dueDate: "2026-06-30"
      }
    ],
    createdAt: new Date().toISOString(),
    validatedAt: new Date().toISOString()
  };
  const saveLeadCompetencies = await leadApi.post("/api/workspace", {
    data: {
      ...savedLeadWorkspace,
      competencyAssessments: [competencyAssessment]
    }
  });
  expect(saveLeadCompetencies.status()).toBe(200);
  const savedCompetencyWorkspace = await saveLeadCompetencies.json();
  expect(savedCompetencyWorkspace.competencyAssessments).toEqual([
    expect.objectContaining({
      id: competencyAssessment.id,
      personId: memberA.personId,
      averageScore: 3.7,
      minScore: 2.5,
      grade: "middle"
    })
  ]);

  const surveyCreate = await leadApi.post("/api/surveys", {
    data: {
      title: `Анонимный пульс Core ${suffix}`,
      description: "Проверка scoped surveys",
      anonymous: true,
      anonymousMinResponses: 2,
      questions: [
        {
          id: "q1",
          type: "scale",
          prompt: "Насколько всё ок?",
          required: true,
          options: []
        },
        {
          id: "q2",
          type: "text",
          prompt: "Что важно знать?",
          required: false,
          options: []
        }
      ]
    }
  });
  expect(surveyCreate.status()).toBe(201);
  const surveyWorkspace = (await surveyCreate.json()).workspace;
  const coreSurvey = surveyWorkspace.surveys.find((survey) => survey.title.includes(`Core ${suffix}`));
  expect(coreSurvey).toBeTruthy();

  const leadBApi = await playwrightRequest.newContext({ baseURL });
  await leadBApi.post("/api/login", {
    data: { username: leadB.username, password: "TeamPass121" }
  });
  const leadBWorkspace = await (await leadBApi.get("/api/workspace")).json();
  expect(leadBWorkspace.surveys.some((survey) => survey.id === coreSurvey.id)).toBeFalsy();
  expect(leadBWorkspace.competencyAssessments.some((assessment) => assessment.id === competencyAssessment.id)).toBeFalsy();
  expect((await leadBApi.delete(`/api/surveys/${encodeURIComponent(coreSurvey.id)}`)).status()).toBe(404);
  await leadBApi.dispose();

  const memberBApi = await playwrightRequest.newContext({ baseURL });
  await memberBApi.post("/api/login", {
    data: { username: memberB.username, password: "TeamPass121" }
  });
  const crossTeamSurveyResponse = await memberBApi.post(`/api/surveys/${encodeURIComponent(coreSurvey.id)}/respond`, {
    data: { answers: { q1: { value: 9 } } }
  });
  expect(crossTeamSurveyResponse.status()).toBe(404);
  await memberBApi.dispose();

  const memberAApi = await playwrightRequest.newContext({ baseURL });
  await memberAApi.post("/api/login", {
    data: { username: memberA.username, password: "TeamPass121" }
  });
  const firstAnonymousResponse = await memberAApi.post(`/api/surveys/${encodeURIComponent(coreSurvey.id)}/respond`, {
    data: { answers: { q1: { value: 7 }, q2: { value: "Первый чувствительный текстовый ответ" } } }
  });
  expect(firstAnonymousResponse.status()).toBe(200);
  const memberAWorkspaceWithAssessment = await (await memberAApi.get("/api/workspace")).json();
  expect(memberAWorkspaceWithAssessment.competencyAssessments).toEqual([
    expect.objectContaining({ id: competencyAssessment.id, grade: "middle" })
  ]);
  const tamperedAssessmentWorkspace = await memberAApi.post("/api/workspace", {
    data: {
      ...memberAWorkspaceWithAssessment,
      competencyAssessments: [
        {
          ...memberAWorkspaceWithAssessment.competencyAssessments[0],
          competencies: [
            {
              ...memberAWorkspaceWithAssessment.competencyAssessments[0].competencies[0],
              score: 0
            }
          ]
        }
      ]
    }
  });
  expect(tamperedAssessmentWorkspace.status()).toBe(200);
  const tamperedAssessmentScoped = await tamperedAssessmentWorkspace.json();
  expect(tamperedAssessmentScoped.competencyAssessments[0].competencies[0].score).toBe(4.5);
  const secondAnonymousResponse = await memberAApi.post(`/api/surveys/${encodeURIComponent(coreSurvey.id)}/respond`, {
    data: { answers: { q1: { value: 8 }, q2: { value: "Обновленный чувствительный текстовый ответ" } } }
  });
  expect(secondAnonymousResponse.status()).toBe(200);
  await memberAApi.dispose();

  const leadCreatedMemberApi = await playwrightRequest.newContext({ baseURL });
  await leadCreatedMemberApi.post("/api/login", {
    data: { username: leadCreated.username, password: "TeamPass121" }
  });
  const thresholdAnonymousResponse = await leadCreatedMemberApi.post(`/api/surveys/${encodeURIComponent(coreSurvey.id)}/respond`, {
    data: { answers: { q1: { value: 6 }, q2: { value: "Второй чувствительный текстовый ответ" } } }
  });
  expect(thresholdAnonymousResponse.status()).toBe(200);
  await leadCreatedMemberApi.dispose();

  const refreshedLeadWorkspace = await (await leadApi.get("/api/workspace")).json();
  const refreshedSurvey = refreshedLeadWorkspace.surveys.find((survey) => survey.id === coreSurvey.id);
  expect(refreshedSurvey.responseCount).toBe(2);
  expect(refreshedSurvey.aggregate.hidden).toBeFalsy();
  expect(refreshedSurvey.aggregate.perQuestion.q2).toEqual(
    expect.objectContaining({
      count: 2,
      redacted: true,
      samples: []
    })
  );
  await leadApi.dispose();

  const otherMemberApi = await playwrightRequest.newContext({ baseURL });
  await otherMemberApi.post("/api/login", {
    data: { username: memberB.username, password: "TeamPass121" }
  });
  const otherMemberWorkspace = await (await otherMemberApi.get("/api/workspace")).json();
  expect(otherMemberWorkspace.people).toHaveLength(1);
  expect(otherMemberWorkspace.people[0].id).toBe(memberB.personId);
  expect(otherMemberWorkspace.lprs).toEqual([]);
  expect(otherMemberWorkspace.competencyAssessments).toEqual([]);
  await otherMemberApi.dispose();
});
