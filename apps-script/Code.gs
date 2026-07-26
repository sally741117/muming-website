/**
 * 牧茗課程預約與初步諮詢系統
 * Time zone: Asia/Taipei
 *
 * Web app:
 * - doGet:  ?action=getAvailableSlots | ?action=getRequestContext
 * - doPost: type=courseBooking | type=consultation | type=workflow | type=workflowRequest | type=appointmentBooking | formType=workflow | formType=consultation
 */

var CONFIG = {
  timezone: 'Asia/Taipei',
  adminEmail: 'muming9000@gmail.com',
  sheets: {
    slots: '可預約時段',
    courseBookings: '課程預約紀錄',
    consultations: '初步諮詢紀錄',
    workflowRequests: '工作改善需求紀錄',
    appointmentRecords: '預約方式紀錄',
    settings: '系統設定'
  },
  slotStartRow: 5,
  status: {
    available: '可預約',
    booked: '已預約',
    closed: '不開放'
  }
};

var SLOT_PERIODS = {
  morning: {
    label: '上午',
    sheetColumn: 2
  },
  afternoon: {
    label: '下午',
    sheetColumn: 3
  }
};

function doGet(e) {
  try {
    var action = getParam_(e, 'action');

    if (action === 'getAvailableSlots') {
      return jsonResponse_(true, {
        slots: getAvailableSlots_()
      });
    }

    if (action === 'getRequestContext') {
      return jsonResponse_(true, getRequestContext_(getParam_(e, 'requestId'), getParam_(e, 'source')));
    }

    return jsonResponse_(false, null, '不支援的查詢動作。');
  } catch (error) {
    console.error(error);
    return jsonResponse_(false, null, '系統暫時無法讀取可預約時段，請稍後再試。');
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    if (!lock.tryLock(30000)) {
      return jsonResponse_(false, null, '目前預約人數較多，請稍後再試。');
    }

    var payload = parsePostPayload_(e);
    var type = String(payload.type || '').trim();
    var formType = String(payload.formType || '').trim();

    if (formType === 'workflow') {
      return handleWorkflowRequest_(payload);
    }

    if (formType === 'consultation') {
      return handleConsultationForm_(payload);
    }

    if (type === 'courseBooking') {
      return handleCourseBooking_(payload);
    }

    if (type === 'consultation') {
      return handleConsultation_(payload);
    }

    if (type === 'workflow' || type === 'workflowRequest') {
      return handleWorkflowRequestJson_(payload);
    }

    if (type === 'appointmentBooking') {
      return jsonResponse_(false, null, '舊版預約方式流程已停用，請改用課程、工作改善或初步諮詢表單送出。');
    }

    return jsonResponse_(false, null, '不支援的送出類型。');
  } catch (error) {
    console.error(error);
    if (isUserFacingError_(error)) {
      return jsonResponse_(false, null, error.message);
    }
    return jsonResponse_(false, null, '資料送出失敗，請確認填寫內容後再試一次。');
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      // Lock may already be released when Apps Script terminates the request.
    }
  }
}

function isUserFacingError_(error) {
  var message = cleanText_(error && error.message);
  return [
    '日期格式不正確',
    '無法預約過期日期',
    '時段不正確',
    '此日期目前未開放預約',
    '此時段已無法預約'
  ].some(function(prefix) {
    return message.indexOf(prefix) === 0;
  });
}

function handleWorkflowRequest_(payload) {
  var requiredFields = [
    'companyContact',
    'workCategory',
    'currentProcess',
    'painPoints',
    'frequency',
    'timeSpent',
    'tools',
    'preferredDate',
    'preferredTime'
  ];
  var validationMessage = validateRequired_(payload, requiredFields);

  if (validationMessage) {
    return postMessageResponse_(false, '', '請確認必填欄位皆已填寫。');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getRequiredSheet_(ss, CONFIG.sheets.workflowRequests);
  var contact = parseCompanyContact_(payload.companyContact);
  var requestId = generateId_('WF');
  var discussionTime = [
    cleanText_(payload.preferredDate),
    cleanText_(payload.preferredTime),
    cleanText_(payload.otherTime)
  ].filter(Boolean).join('／');
  var workflowSummary = joinParts_([
    cleanText_(payload.workCategory),
    cleanText_(payload.otherWorkCategory)
  ], '、');
  var painSummary = joinParts_([
    cleanText_(payload.painPoints),
    cleanText_(payload.otherPainPoint)
  ], '、');
  var toolsSummary = joinParts_([
    cleanText_(payload.tools),
    cleanText_(payload.otherTool)
  ], '、');
  var notes = [
    cleanText_(payload.frequency) ? '執行頻率：' + cleanText_(payload.frequency) : '',
    cleanText_(payload.timeSpent) ? '花費時間：' + cleanText_(payload.timeSpent) : '',
    cleanText_(payload.budgetChoice) ? '預算資訊：' + cleanText_(payload.budgetChoice) : '',
    cleanText_(payload.budgetRange) ? '預算範圍：' + cleanText_(payload.budgetRange) : '',
    cleanText_(payload.referenceFileNames) ? '參考資料檔名：' + cleanText_(payload.referenceFileNames) : ''
  ].filter(Boolean).join('\n');

  var row = [
    nowText_(),
    requestId,
    contact.companyName,
    contact.industry,
    contact.contactName,
    contact.phone,
    contact.email,
    contact.lineId,
    workflowSummary,
    cleanText_(payload.currentProcess),
    painSummary,
    '',
    '',
    toolsSummary,
    '',
    discussionTime,
    '',
    notes,
    '網站送出',
    '新申請',
    ''
  ];

  sheet.appendRow(row);
  sendWorkflowEmail_(requestId, payload, contact, discussionTime);

  return postMessageResponse_(true, requestId, '工作改善需求已送出。');
}

function handleWorkflowRequestJson_(payload) {
  var requiredFields = [
    'companyName',
    'contactName',
    'phone',
    'contactTimes'
  ];
  var validationMessage = validateRequired_(payload, requiredFields);

  if (validationMessage) {
    return jsonResponse_(false, null, validationMessage);
  }

  validationMessage = validateContactChoice_(payload);
  if (validationMessage) {
    return jsonResponse_(false, null, validationMessage);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getRequiredSheet_(ss, CONFIG.sheets.workflowRequests);
  var requestId = generateId_('WF');
  var workflowNeed = cleanText_(payload.workflowNeed) || cleanText_(payload.serviceInterest);
  var currentProcess = cleanText_(payload.currentProcess) || cleanText_(payload.needsDescription);
  var painPoints = cleanText_(payload.painPoints);
  var desiredOutcome = cleanText_(payload.desiredOutcome) || cleanText_(payload.workflowDetails);
  var departments = cleanText_(payload.departments);
  var currentTools = cleanText_(payload.currentTools);
  var needsCalendar = cleanText_(payload.consultationMode) === 'onsite';
  var slotInfo = needsCalendar ? reserveSlot_(ss, payload.date, payload.period) : { date: '', periodLabel: '' };
  var discussionMode = needsCalendar ? '現場討論' : '等待聯絡';
  var notes = [
    cleanText_(payload.notes),
    cleanText_(payload.siteUndecided) ? '地點尚未確定' : ''
  ].filter(Boolean).join('\n');

  appendRecordByHeaders_(sheet, {
    '建立時間': nowText_(),
    '申請編號': requestId,
    '公司名稱': cleanText_(payload.companyName),
    '公司產業': cleanText_(payload.industry),
    '聯絡人': cleanText_(payload.contactName),
    '手機號碼': cleanText_(payload.phone),
    'Email': cleanText_(payload.email),
    'LINE ID': cleanText_(payload.lineId),
    '想改善的工作流程': workflowNeed,
    '目前處理方式': currentProcess,
    '目前困擾': painPoints,
    '希望改善結果': desiredOutcome,
    '使用部門或人員': departments,
    '目前使用的工具或系統': currentTools,
    '希望討論地點': cleanText_(payload.discussionLocation),
    '方便聯絡時段': cleanText_(payload.contactTimes),
    '希望聯絡方式': cleanText_(payload.preferredContact),
    '補充說明': notes,
    '預約日期': slotInfo.date,
    '預約時段': slotInfo.periodLabel,
    '討論方式': discussionMode,
    '來源': '網站送出',
    '處理狀態': '新申請',
    '內部備註': ''
  });
  sendWorkflowJsonEmail_(requestId, payload, slotInfo.date, slotInfo.periodLabel);

  return jsonResponse_(true, {
    workflowId: requestId,
    message: '工作改善需求已送出。'
  });
}

function handleAppointmentBooking_(payload) {
  var requiredFields = ['requestId', 'source', 'appointmentType'];
  var validationMessage = validateRequired_(payload, requiredFields);

  if (validationMessage) {
    return jsonResponse_(false, null, '缺少原申請資料，請從原表單成功畫面重新進入預約頁。');
  }

  var appointmentType = cleanText_(payload.appointmentType);
  var needsCalendar = appointmentType === 'onsiteConsultation' || appointmentType === 'courseBooking';
  var normalizedDate = '';
  var periodLabel = '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var appointmentSheet = getRequiredSheet_(ss, CONFIG.sheets.appointmentRecords);

  if (appointmentType !== 'phoneConsultation' && appointmentType !== 'onsiteConsultation' && appointmentType !== 'courseBooking') {
    return jsonResponse_(false, null, '不支援的預約方式。');
  }

  if (needsCalendar) {
    normalizedDate = normalizeDate_(payload.date);
    if (!normalizedDate) {
      return jsonResponse_(false, null, '日期格式不正確，請重新選擇日期。');
    }

    if (isPastDate_(normalizedDate)) {
      return jsonResponse_(false, null, '無法預約過期日期，請重新選擇。');
    }

    var periodKey = cleanText_(payload.period);
    var period = SLOT_PERIODS[periodKey];
    if (!period) {
      return jsonResponse_(false, null, '時段不正確，請重新選擇。');
    }

    var slotSheet = getRequiredSheet_(ss, CONFIG.sheets.slots);
    var slotMatch = findSlotRow_(slotSheet, normalizedDate);
    if (!slotMatch) {
      return jsonResponse_(false, null, '此日期目前未開放預約。');
    }

    var statusCell = slotSheet.getRange(slotMatch.row, period.sheetColumn);
    if (normalizeStatus_(statusCell.getValue()) !== CONFIG.status.available) {
      return jsonResponse_(false, null, '此時段已無法預約，請重新選擇其他時段。');
    }

    periodLabel = period.label;
    statusCell.setValue(CONFIG.status.booked);
  }

  var appointmentId = generateId_('AP');
  var row = [
    nowText_(),
    appointmentId,
    cleanText_(payload.requestId),
    cleanText_(payload.source),
    appointmentTypeLabel_(appointmentType),
    normalizedDate,
    periodLabel,
    joinParts_([cleanText_(payload.onsiteAddressMode), cleanText_(payload.onsiteAddress)], '：'),
    joinParts_([cleanText_(payload.courseAddressMode), cleanText_(payload.courseAddress)], '：'),
    joinParts_([cleanText_(payload.attendeeCountMode), cleanText_(payload.attendeeCount)], '：'),
    joinParts_([cleanText_(payload.courseTopics), cleanText_(payload.otherCourseNeeds)], '\n'),
    '網站送出',
    '新預約',
    ''
  ];

  appointmentSheet.appendRow(row);
  sendAppointmentEmail_(appointmentId, payload, normalizedDate, periodLabel);

  return jsonResponse_(true, {
    appointmentId: appointmentId,
    message: '預約方式已送出。'
  });
}

function handleCourseBooking_(payload) {
  var requiredFields = [
    'companyName',
    'contactName',
    'phone',
    'date',
    'period'
  ];
  var validationMessage = validateRequired_(payload, requiredFields);

  if (validationMessage) {
    return jsonResponse_(false, null, validationMessage);
  }

  var normalizedDate = normalizeDate_(payload.date);
  if (!normalizedDate) {
    return jsonResponse_(false, null, '日期格式不正確，請重新選擇日期。');
  }

  if (isPastDate_(normalizedDate)) {
    return jsonResponse_(false, null, '無法預約過期日期，請重新選擇。');
  }

  var periodKey = String(payload.period || '').trim();
  var period = SLOT_PERIODS[periodKey];
  if (!period) {
    return jsonResponse_(false, null, '時段不正確，請重新選擇。');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var slotSheet = getRequiredSheet_(ss, CONFIG.sheets.slots);
  var slotMatch = findSlotRow_(slotSheet, normalizedDate);

  if (!slotMatch) {
    return jsonResponse_(false, null, '此日期目前未開放預約。');
  }

  var statusCell = slotSheet.getRange(slotMatch.row, period.sheetColumn);
  var currentStatus = normalizeStatus_(statusCell.getValue());

  if (currentStatus !== CONFIG.status.available) {
    return jsonResponse_(false, null, '此時段已無法預約，請重新選擇其他時段。');
  }

  var bookingId = generateId_('BK');
  var createdAt = nowText_();
  var bookingSheet = getRequiredSheet_(ss, CONFIG.sheets.courseBookings);
  var courseType = cleanText_(payload.courseType) || '免費 AI 課程';
  var courseNeedSummary = joinParts_([
    cleanText_(payload.courseFormat) ? '希望課程形式：' + cleanText_(payload.courseFormat) : '',
    cleanText_(payload.audience) ? '上課對象：' + cleanText_(payload.audience) : '',
    cleanText_(payload.courseTopics) ? '想了解的主題：' + cleanText_(payload.courseTopics) : '',
    cleanText_(payload.courseNeeds)
  ], '\n');
  appendRecordByHeaders_(bookingSheet, {
    '建立時間': createdAt,
    '預約編號': bookingId,
    '申請編號': bookingId,
    '課程類型': courseType,
    '預約日期': normalizedDate,
    '預約時段': period.label,
    '公司名稱': cleanText_(payload.companyName),
    '企業名稱': cleanText_(payload.companyName),
    '公司產業': cleanText_(payload.industry),
    '行業類別': cleanText_(payload.industry),
    '聯絡人': cleanText_(payload.contactName),
    '手機號碼': cleanText_(payload.phone),
    '聯絡電話': cleanText_(payload.phone),
    'Email': cleanText_(payload.email),
    'LINE ID': cleanText_(payload.lineId),
    '上課地址': cleanText_(payload.address),
    '上課地點': cleanText_(payload.address),
    '預計人數': cleanText_(payload.expectedAttendees),
    '上課對象': cleanText_(payload.audience),
    '團隊 AI 程度': cleanText_(payload.aiLevel),
    '團隊 AI 使用程度': cleanText_(payload.aiLevel),
    '希望課程形式': cleanText_(payload.courseFormat),
    '想了解的課程主題': cleanText_(payload.courseTopics),
    '想了解的主題': cleanText_(payload.courseTopics),
    '特殊需求或補充內容': cleanText_(payload.courseNeeds),
    '其他需求或補充內容': cleanText_(payload.courseNeeds),
    '課程需求': courseNeedSummary,
    '方便聯絡時段': cleanText_(payload.contactTimes),
    '希望聯絡方式': cleanText_(payload.preferredContact),
    '補充說明': cleanText_(payload.notes),
    '來源': '網站送出',
    '處理狀態': '新申請',
    '狀態': '新申請',
    '內部備註': ''
  });
  statusCell.setValue(CONFIG.status.booked);

  sendCourseBookingEmail_(bookingId, normalizedDate, period.label, payload);

  return jsonResponse_(true, {
    bookingId: bookingId,
    message: '預約成功，我們會依照您填寫的方便聯絡時段與您聯繫。'
  });
}

function handleConsultationForm_(payload) {
  var requiredFields = [
    'companyName',
    'contactName',
    'phone',
    'contactTimes'
  ];
  var validationMessage = validateRequired_(payload, requiredFields);

  if (validationMessage) {
    return postMessageResponse_(false, '', '請完整填寫必要欄位。');
  }

  validationMessage = validateContactChoice_(payload);
  if (validationMessage) {
    return postMessageResponse_(false, '', validationMessage);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var consultationSheet = getRequiredSheet_(ss, CONFIG.sheets.consultations);
  var consultationId = generateId_('CS');
  var serviceInterest = joinParts_([
    cleanText_(payload.serviceInterest),
    cleanText_(payload.otherServiceInterest)
  ], '、');
  appendRecordByHeaders_(consultationSheet, {
    '建立時間': nowText_(),
    '諮詢編號': consultationId,
    '申請編號': consultationId,
    '公司名稱': cleanText_(payload.companyName),
    '公司產業': cleanText_(payload.industry),
    '聯絡人': cleanText_(payload.contactName),
    '手機號碼': cleanText_(payload.phone),
    'Email': cleanText_(payload.email),
    'LINE ID': cleanText_(payload.lineId),
    '想了解的服務': serviceInterest,
    '需求說明': cleanText_(payload.needsDescription),
    '方便聯絡時段': cleanText_(payload.contactTimes),
    '希望聯絡方式': cleanText_(payload.preferredContact),
    '補充說明': cleanText_(payload.notes),
    '希望討論地點': '',
    '上課地址': '',
    '預計人數': '',
    '課程需求': '',
    '預約日期': '',
    '預約時段': '',
    '討論方式': '電話聯絡',
    '來源': '網站送出'
  });
  sendConsultationEmail_(consultationId, {
    companyName: payload.companyName,
    industry: payload.industry,
    contactName: payload.contactName,
    phone: payload.phone,
    email: payload.email,
    lineId: payload.lineId,
    serviceInterest: serviceInterest,
    needsDescription: payload.needsDescription,
    consultationMode: 'phone',
    discussionLocation: '',
    contactTimes: payload.contactTimes,
    preferredContact: payload.preferredContact,
    notes: payload.notes
  }, '', '');

  return postMessageResponse_(true, consultationId, '初步討論需求已送出。');
}

function handleConsultation_(payload) {
  var requiredFields = [
    'companyName',
    'contactName',
    'phone'
  ];
  var validationMessage = validateRequired_(payload, requiredFields);

  if (validationMessage) {
    return jsonResponse_(false, null, validationMessage);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var consultationMode = cleanText_(payload.consultationMode) || 'phone';
  var slotInfo = consultationMode === 'onsite'
    ? reserveSlot_(ss, payload.date, payload.period)
    : { date: '', periodLabel: '' };
  var consultationSheet = getRequiredSheet_(ss, CONFIG.sheets.consultations);
  var consultationId = generateId_('CS');
  var createdAt = nowText_();
  var discussionMode = consultationMode === 'onsite' ? '現場討論' : '電話聯絡';
  var notes = [
    cleanText_(payload.notes),
    cleanText_(payload.siteUndecided) ? '地點尚未確定' : ''
  ].filter(Boolean).join('\n');
  appendRecordByHeaders_(consultationSheet, {
    '建立時間': createdAt,
    '諮詢編號': consultationId,
    '申請編號': consultationId,
    '公司名稱': cleanText_(payload.companyName),
    '企業名稱': cleanText_(payload.companyName),
    '公司產業': cleanText_(payload.industry),
    '行業類別': cleanText_(payload.industry),
    '聯絡人': cleanText_(payload.contactName),
    '手機號碼': cleanText_(payload.phone),
    '聯絡電話': cleanText_(payload.phone),
    'Email': cleanText_(payload.email),
    'LINE ID': cleanText_(payload.lineId),
    '想了解的服務': cleanText_(payload.serviceInterest),
    '想討論的方向': cleanText_(payload.serviceInterest),
    '需求說明': cleanText_(payload.needsDescription),
    '簡單說明目前情況': cleanText_(payload.needsDescription),
    '方便聯絡時段': cleanText_(payload.contactTimes),
    '希望聯絡方式': cleanText_(payload.preferredContact),
    '補充說明': notes,
    '希望討論地點': cleanText_(payload.discussionLocation),
    '上課地址': cleanText_(payload.courseAddress),
    '預計人數': cleanText_(payload.expectedAttendees),
    '課程需求': cleanText_(payload.courseNeeds),
    '預約日期': slotInfo.date,
    '預約時段': slotInfo.periodLabel,
    '討論方式': discussionMode,
    '來源': '網站送出'
  });
  sendConsultationEmail_(consultationId, payload, slotInfo.date, slotInfo.periodLabel);

  return jsonResponse_(true, {
    consultationId: consultationId,
    message: '諮詢資料已送出，我們會依照您填寫的方便聯絡時段與您聯繫。'
  });
}

function reserveSlot_(ss, dateValue, periodValue) {
  var normalizedDate = normalizeDate_(dateValue);
  if (!normalizedDate) {
    throw new Error('日期格式不正確，請重新選擇日期。');
  }

  if (isPastDate_(normalizedDate)) {
    throw new Error('無法預約過期日期，請重新選擇。');
  }

  var periodKey = cleanText_(periodValue);
  var period = SLOT_PERIODS[periodKey];
  if (!period) {
    throw new Error('時段不正確，請重新選擇。');
  }

  var slotSheet = getRequiredSheet_(ss, CONFIG.sheets.slots);
  var slotMatch = findSlotRow_(slotSheet, normalizedDate);
  if (!slotMatch) {
    throw new Error('此日期目前未開放預約。');
  }

  var statusCell = slotSheet.getRange(slotMatch.row, period.sheetColumn);
  if (normalizeStatus_(statusCell.getValue()) !== CONFIG.status.available) {
    throw new Error('此時段已無法預約，請重新選擇其他時段。');
  }

  statusCell.setValue(CONFIG.status.booked);
  return {
    date: normalizedDate,
    periodLabel: period.label
  };
}

function getAvailableSlots_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getRequiredSheet_(ss, CONFIG.sheets.slots);
  var lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.slotStartRow) {
    return [];
  }

  var rowCount = lastRow - CONFIG.slotStartRow + 1;
  var values = sheet.getRange(CONFIG.slotStartRow, 1, rowCount, 4).getValues();
  var today = getTodayDate_();
  var slots = [];

  values.forEach(function(row) {
    var normalizedDate = normalizeDate_(row[0]);
    if (!normalizedDate) {
      return;
    }

    var dateObj = parseNormalizedDate_(normalizedDate);
    if (dateObj.getTime() < today.getTime()) {
      return;
    }

    var morningStatus = normalizeStatus_(row[1]);
    var afternoonStatus = normalizeStatus_(row[2]);
    var periods = [];

    if (morningStatus === CONFIG.status.available) {
      periods.push({
        key: 'morning',
        label: SLOT_PERIODS.morning.label
      });
    }

    if (afternoonStatus === CONFIG.status.available) {
      periods.push({
        key: 'afternoon',
        label: SLOT_PERIODS.afternoon.label
      });
    }

    if (!periods.length) {
      return;
    }

    slots.push({
      date: normalizedDate,
      periods: periods,
      areaNote: cleanText_(row[3])
    });
  });

  return slots.sort(function(a, b) {
    return a.date > b.date ? 1 : a.date < b.date ? -1 : 0;
  });
}

function getRequestContext_(requestId, source) {
  var id = cleanText_(requestId);
  var requestSource = cleanText_(source);

  if (!id || !requestSource) {
    return {
      requestId: id,
      source: requestSource,
      found: false,
      hasOnsiteAddress: false,
      hasCourseAddress: false,
      hasExpectedAttendees: false,
      hasCourseNeeds: false,
      hasContactTimes: false
    };
  }

  var record = findRequestRecord_(id, requestSource);
  var summary = buildRequestSummary_(record, requestSource);
  return {
    requestId: id,
    source: requestSource,
    found: Boolean(record),
    hasOnsiteAddress: Boolean(record && hasAnyValue_(record, ['希望討論地點'])),
    hasCourseAddress: Boolean(record && hasAnyValue_(record, ['上課地址'])),
    hasExpectedAttendees: Boolean(record && hasAnyValue_(record, ['預計人數'])),
    hasCourseNeeds: Boolean(record && hasAnyValue_(record, ['課程需求'])),
    hasContactTimes: Boolean(record && hasAnyValue_(record, ['方便聯絡時段'])),
    summary: summary,
    course: {
      onsiteAddress: getRecordValue_(record, ['希望討論地點']),
      courseAddress: getRecordValue_(record, ['上課地址']),
      expectedAttendees: getRecordValue_(record, ['預計人數']),
      aiLevel: getRecordValue_(record, ['團隊 AI 程度']),
      courseNeeds: getRecordValue_(record, ['課程需求']),
      courseTopics: getRecordValue_(record, ['想了解的主題', '課程主題'])
    }
  };
}

function buildRequestSummary_(record, source) {
  if (!record) {
    return {
      companyName: '',
      industry: '',
      contactName: '',
      phone: '',
      emailOrLine: '',
      requestNeed: '',
      contactTimes: '',
      preferredContact: ''
    };
  }

  return {
    companyName: getRecordValue_(record, ['公司名稱']),
    industry: getRecordValue_(record, ['公司產業']),
    contactName: getRecordValue_(record, ['聯絡人']),
    phone: getRecordValue_(record, ['手機號碼']),
    emailOrLine: joinParts_([
      getRecordValue_(record, ['Email']),
      getRecordValue_(record, ['LINE ID'])
    ], '／'),
    requestNeed: source === 'workflow'
      ? joinParts_([
        getRecordValue_(record, ['想改善的工作流程']),
        getRecordValue_(record, ['目前處理方式']),
        getRecordValue_(record, ['目前困擾']),
        getRecordValue_(record, ['希望改善結果'])
      ], '；')
      : joinParts_([
        getRecordValue_(record, ['想了解的服務']),
        getRecordValue_(record, ['需求說明']),
        getRecordValue_(record, ['課程需求'])
      ], '；'),
    contactTimes: getRecordValue_(record, ['方便聯絡時段']),
    preferredContact: getRecordValue_(record, ['希望聯絡方式'])
  };
}

function getRecordValue_(record, labels) {
  if (!record) {
    return '';
  }

  for (var i = 0; i < labels.length; i += 1) {
    var value = cleanText_(record[labels[i]]);
    if (value) {
      return value;
    }
  }

  return '';
}

function findRequestRecord_(requestId, source) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var candidates = [];

  if (source === 'workflow') {
    candidates.push(CONFIG.sheets.workflowRequests);
  } else if (source === 'consultation') {
    candidates.push(CONFIG.sheets.consultations);
  } else if (source === 'course') {
    candidates.push(CONFIG.sheets.courseBookings);
  } else {
    candidates.push(CONFIG.sheets.workflowRequests);
    candidates.push(CONFIG.sheets.consultations);
    candidates.push(CONFIG.sheets.courseBookings);
  }

  for (var i = 0; i < candidates.length; i += 1) {
    var sheet = getOptionalSheet_(ss, candidates[i]);
    if (!sheet) {
      continue;
    }

    var record = findRecordById_(sheet, requestId);
    if (record) {
      return record;
    }
  }

  return null;
}

function findRecordById_(sheet, requestId) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 2) {
    return null;
  }

  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(cleanText_);

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    for (var colIndex = 0; colIndex < Math.min(lastColumn, 4); colIndex += 1) {
      if (cleanText_(values[rowIndex][colIndex]) === requestId) {
        var record = {};
        headers.forEach(function(header, index) {
          if (header) {
            record[header] = values[rowIndex][index];
          }
        });
        record.__row = rowIndex + 1;
        record.__sheetName = sheet.getName();
        return record;
      }
    }
  }

  return null;
}

function hasAnyValue_(record, labels) {
  for (var i = 0; i < labels.length; i += 1) {
    var label = labels[i];
    if (cleanText_(record[label])) {
      return true;
    }
  }
  return false;
}

function findSlotRow_(sheet, normalizedDate) {
  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.slotStartRow) {
    return null;
  }

  var rowCount = lastRow - CONFIG.slotStartRow + 1;
  var values = sheet.getRange(CONFIG.slotStartRow, 1, rowCount, 1).getValues();

  for (var i = 0; i < values.length; i += 1) {
    if (normalizeDate_(values[i][0]) === normalizedDate) {
      return {
        row: CONFIG.slotStartRow + i
      };
    }
  }

  return null;
}

function parsePostPayload_(e) {
  if (!e) {
    return {};
  }

  if (e.postData && e.postData.contents) {
    var contents = e.postData.contents;
    var contentType = String(e.postData.type || '').toLowerCase();

    if (contentType.indexOf('application/json') !== -1) {
      return JSON.parse(contents);
    }

    if (contentType.indexOf('application/x-www-form-urlencoded') !== -1) {
      var params = e.parameter || {};
      if (params.payload) {
        return JSON.parse(params.payload);
      }
      return params;
    }

    try {
      return JSON.parse(contents);
    } catch (jsonError) {
      if (e.parameter && e.parameter.payload) {
        return JSON.parse(e.parameter.payload);
      }
    }
  }

  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  return e.parameter || {};
}

function getParam_(e, key) {
  return e && e.parameter ? String(e.parameter[key] || '').trim() : '';
}

function validateRequired_(payload, fields) {
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    if (!cleanText_(payload[field])) {
      return '請確認必填欄位皆已填寫。';
    }
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email).trim())) {
    return 'Email 格式不正確，請重新確認。';
  }

  return '';
}

function validateContactChoice_(payload) {
  if (!cleanText_(payload.email) && !cleanText_(payload.lineId)) {
    return '請至少填寫 Email 或 LINE ID 其中一項。';
  }

  return '';
}

function normalizeDate_(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, CONFIG.timezone, 'yyyy-MM-dd');
  }

  var text = String(value).trim();
  var match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (!match) {
    return '';
  }

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '';
  }

  return [
    year,
    pad2_(month),
    pad2_(day)
  ].join('-');
}

function parseNormalizedDate_(dateText) {
  var parts = dateText.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isPastDate_(dateText) {
  return parseNormalizedDate_(dateText).getTime() < getTodayDate_().getTime();
}

function getTodayDate_() {
  var todayText = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd');
  return parseNormalizedDate_(todayText);
}

function normalizeStatus_(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function cleanText_(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText_).filter(Boolean).join('、');
  }

  return String(value || '').trim();
}

function getRequiredSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Missing sheet: ' + sheetName);
  }
  return sheet;
}

function getOptionalSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName);
}

function appendRecordByHeaders_(sheet, record) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('Missing headers: ' + sheet.getName());
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_);
  var row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
  });
  sheet.appendRow(row);
}

function generateId_(prefix) {
  var timestamp = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyyMMddHHmmss');
  var random = Utilities.getUuid().split('-')[0].toUpperCase();
  return prefix + '-' + timestamp + '-' + random;
}

function nowText_() {
  return Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss');
}

function pad2_(number) {
  return number < 10 ? '0' + number : String(number);
}

function jsonResponse_(success, data, errorMessage) {
  var payload = {
    success: Boolean(success)
  };

  if (success) {
    payload.data = data || {};
  } else {
    payload.error = errorMessage || '系統發生錯誤，請稍後再試。';
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendCourseBookingEmail_(bookingId, date, periodLabel, payload) {
  var subject = '牧茗企業 AI 課程預約通知：' + bookingId;
  var body = [
    '收到新的企業 AI 課程預約。',
    '',
    '預約編號：' + bookingId,
    '預約日期：' + date,
    '預約時段：' + periodLabel,
    '公司名稱：' + cleanText_(payload.companyName),
    '公司產業：' + cleanText_(payload.industry),
    '聯絡人：' + cleanText_(payload.contactName),
    '手機號碼：' + cleanText_(payload.phone),
    'Email：' + cleanText_(payload.email),
    'LINE ID：' + cleanText_(payload.lineId),
    '上課地址：' + cleanText_(payload.address),
    '預計人數：' + cleanText_(payload.expectedAttendees),
    '團隊 AI 程度：' + cleanText_(payload.aiLevel),
    '想了解的課程主題：' + cleanText_(payload.courseTopics),
    '課程需求：' + cleanText_(payload.courseNeeds),
    '方便聯絡時段：' + cleanText_(payload.contactTimes),
    '希望聯絡方式：' + cleanText_(payload.preferredContact),
    '補充說明：' + cleanText_(payload.notes)
  ].join('\n');

  MailApp.sendEmail(CONFIG.adminEmail, subject, body);
}

function sendConsultationEmail_(consultationId, payload, date, periodLabel) {
  var subject = '牧茗初步諮詢通知：' + consultationId;
  var body = [
    '收到新的初步諮詢。',
    '',
    '諮詢編號：' + consultationId,
    '公司名稱：' + cleanText_(payload.companyName),
    '公司產業：' + cleanText_(payload.industry),
    '聯絡人：' + cleanText_(payload.contactName),
    '手機號碼：' + cleanText_(payload.phone),
    'Email：' + cleanText_(payload.email),
    'LINE ID：' + cleanText_(payload.lineId),
    '想了解的服務：' + cleanText_(payload.serviceInterest),
    '需求說明：' + cleanText_(payload.needsDescription),
    '諮詢方式：' + consultationModeLabel_(payload.consultationMode),
    '預約日期：' + cleanText_(date),
    '預約時段：' + cleanText_(periodLabel),
    '希望討論地點：' + cleanText_(payload.discussionLocation),
    '方便聯絡時段：' + cleanText_(payload.contactTimes),
    '希望聯絡方式：' + cleanText_(payload.preferredContact),
    '補充說明：' + cleanText_(payload.notes)
  ].join('\n');

  MailApp.sendEmail(CONFIG.adminEmail, subject, body);
}

function sendWorkflowJsonEmail_(requestId, payload, date, periodLabel) {
  var subject = '牧茗工作改善需求通知：' + requestId;
  var body = [
    '收到新的工作改善需求。',
    '',
    '申請編號：' + requestId,
    '公司名稱：' + cleanText_(payload.companyName),
    '公司產業：' + cleanText_(payload.industry),
    '聯絡人：' + cleanText_(payload.contactName),
    '手機號碼：' + cleanText_(payload.phone),
    'Email：' + cleanText_(payload.email),
    'LINE ID：' + cleanText_(payload.lineId),
    '想改善的工作流程：' + (cleanText_(payload.workflowNeed) || cleanText_(payload.needsDescription)),
    '目前處理方式：' + cleanText_(payload.currentProcess),
    '目前困擾：' + cleanText_(payload.painPoints),
    '希望改善結果：' + (cleanText_(payload.desiredOutcome) || cleanText_(payload.workflowDetails)),
    '使用部門或人員：' + cleanText_(payload.departments),
    '目前使用的工具或系統：' + cleanText_(payload.currentTools),
    '諮詢方式：' + consultationModeLabel_(payload.consultationMode),
    '預約日期：' + cleanText_(date),
    '預約時段：' + cleanText_(periodLabel),
    '希望討論地點：' + cleanText_(payload.discussionLocation),
    '方便聯絡時段：' + cleanText_(payload.contactTimes),
    '希望聯絡方式：' + cleanText_(payload.preferredContact),
    '補充說明：' + cleanText_(payload.notes)
  ].join('\n');

  MailApp.sendEmail(CONFIG.adminEmail, subject, body);
}

function consultationModeLabel_(mode) {
  var labels = {
    phone: '電話諮詢',
    onsite: '現場諮詢'
  };
  return labels[cleanText_(mode)] || cleanText_(mode) || '電話諮詢';
}

function periodKeyLabel_(periodKey) {
  var period = SLOT_PERIODS[cleanText_(periodKey)];
  return period ? period.label : cleanText_(periodKey);
}

function sendWorkflowEmail_(requestId, payload, contact, discussionTime) {
  var subject = '牧茗工作改善需求通知：' + requestId;
  var body = [
    '收到新的工作改善需求。',
    '',
    '申請編號：' + requestId,
    '公司名稱：' + cleanText_(contact.companyName),
    '公司產業：' + cleanText_(contact.industry),
    '聯絡人：' + cleanText_(contact.contactName),
    '手機號碼：' + cleanText_(contact.phone),
    'Email：' + cleanText_(contact.email),
    'LINE ID：' + cleanText_(contact.lineId),
    '想改善的工作流程：' + joinParts_([cleanText_(payload.workCategory), cleanText_(payload.otherWorkCategory)], '、'),
    '目前處理方式：' + cleanText_(payload.currentProcess),
    '目前困擾：' + joinParts_([cleanText_(payload.painPoints), cleanText_(payload.otherPainPoint)], '、'),
    '執行頻率與花費時間：' + joinParts_([cleanText_(payload.frequency), cleanText_(payload.timeSpent)], '；'),
    '目前使用的工具或系統：' + joinParts_([cleanText_(payload.tools), cleanText_(payload.otherTool)], '、'),
    '方便聯絡時段：' + cleanText_(discussionTime),
    '補充說明：' + joinParts_([cleanText_(payload.budgetChoice), cleanText_(payload.budgetRange), cleanText_(payload.referenceFileNames)], '；')
  ].join('\n');

  MailApp.sendEmail(CONFIG.adminEmail, subject, body);
}

function parseCompanyContact_(companyContact) {
  var text = cleanText_(companyContact);
  var parts = text.split(/[／\/\n,，]/).map(cleanText_).filter(Boolean);
  var emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  var phoneMatch = text.match(/(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}|0\d{1,2}[-\s]?\d{6,8}/);

  return {
    companyName: parts[0] || text,
    industry: parts[1] || '',
    contactName: parts[2] || '',
    phone: phoneMatch ? phoneMatch[0] : (parts[3] || ''),
    email: emailMatch ? emailMatch[0] : '',
    lineId: ''
  };
}

function joinParts_(values, separator) {
  return values.map(cleanText_).filter(Boolean).join(separator || '、');
}

function postMessageResponse_(ok, submissionId, message) {
  var payload = {
    type: 'muming-form-response',
    ok: Boolean(ok),
    submissionId: submissionId || '',
    message: message || ''
  };
  var html = '<!doctype html><html><body><script>' +
    'window.parent.postMessage(' + JSON.stringify(payload) + ', "*");' +
    '</script></body></html>';

  return HtmlService.createHtmlOutput(html);
}

function appointmentTypeLabel_(appointmentType) {
  var labels = {
    phoneConsultation: '電話諮詢',
    onsiteConsultation: '現場諮詢',
    courseBooking: '預約上課'
  };
  return labels[appointmentType] || appointmentType;
}

function sendAppointmentEmail_(appointmentId, payload, date, periodLabel) {
  var subject = '牧茗預約方式通知：' + appointmentId;
  var body = [
    '收到新的預約方式選擇。',
    '',
    '預約編號：' + appointmentId,
    '原申請編號：' + cleanText_(payload.requestId),
    '原申請來源：' + cleanText_(payload.source),
    '預約方式：' + appointmentTypeLabel_(cleanText_(payload.appointmentType)),
    '預約日期：' + cleanText_(date),
    '預約時段：' + cleanText_(periodLabel),
    '現場諮詢地址選擇：' + cleanText_(payload.onsiteAddressMode),
    '補充現場諮詢地址：' + cleanText_(payload.onsiteAddress),
    '上課地址選擇：' + cleanText_(payload.courseAddressMode),
    '補充上課地址：' + cleanText_(payload.courseAddress),
    '預計人數選擇：' + cleanText_(payload.attendeeCountMode),
    '更新人數：' + cleanText_(payload.attendeeCount),
    '課程主題：' + cleanText_(payload.courseTopics),
    '其他課程需求：' + cleanText_(payload.otherCourseNeeds)
  ].join('\n');

  MailApp.sendEmail(CONFIG.adminEmail, subject, body);
}

function ensureCourseBookingHeaders() {
  var requiredHeaders = [
    '課程類型',
    '上課對象',
    '希望課程形式',
    '上課地點',
    '想了解的主題'
  ];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getRequiredSheet_(ss, CONFIG.sheets.courseBookings);
  var lastColumn = sheet.getLastColumn();
  var existingHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_)
    : [];
  var existingSet = {};
  var alreadyExists = [];
  var missingHeaders = [];

  existingHeaders.forEach(function(header) {
    if (header) {
      existingSet[header] = true;
    }
  });

  requiredHeaders.forEach(function(header) {
    if (existingSet[header]) {
      alreadyExists.push(header);
    } else {
      missingHeaders.push(header);
    }
  });

  if (missingHeaders.length) {
    sheet.getRange(1, lastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  Logger.log('新增欄位：' + (missingHeaders.length ? missingHeaders.join('、') : '無'));
  Logger.log('原本已存在欄位：' + (alreadyExists.length ? alreadyExists.join('、') : '無'));
}

function testGetAvailableSlots() {
  var result = getAvailableSlots_();
  Logger.log(JSON.stringify(result, null, 2));
}

function testCourseBooking() {
  var payload = {
    type: 'courseBooking',
    companyName: '測試公司',
    industry: '教育訓練',
    contactName: '測試聯絡人',
    phone: '0912345678',
    email: 'test@example.com',
    lineId: 'test-line',
    address: '台北市測試路 1 號',
    expectedAttendees: '12',
    aiLevel: '初學',
    courseNeeds: '希望了解生成式 AI 在行政與行銷上的應用。',
    contactTimes: '平日上午、平日下午',
    preferredContact: 'Email',
    notes: '這是 Apps Script 測試資料。',
    date: '2026-08-05',
    period: 'morning'
  };

  Logger.log(handleCourseBooking_(payload).getContent());
}

function testConsultation() {
  var payload = {
    type: 'consultation',
    companyName: '測試公司',
    industry: '服務業',
    contactName: '測試聯絡人',
    phone: '0912345678',
    email: 'test@example.com',
    lineId: 'test-line',
    serviceInterest: '企業 AI 課程',
    needsDescription: '想先討論適合團隊的導入方式。',
    contactTimes: '平日上午、平日下午',
    preferredContact: '電話',
    notes: '這是 Apps Script 測試資料。'
  };

  Logger.log(handleConsultation_(payload).getContent());
}

function testWorkflowRequest() {
  var payload = {
    formType: 'workflow',
    companyContact: '測試公司／服務業／王小姐／0912345678／test@example.com',
    workCategory: '行政文件與資料整理',
    otherWorkCategory: '',
    currentProcess: '目前由同仁手動整理表單資料，再複製到試算表。',
    painPoints: ['花費時間太多', '容易漏掉或出錯'],
    otherPainPoint: '',
    frequency: '每天一次',
    timeSpent: '每天約 2 小時',
    tools: ['LINE', 'Excel', 'Google 試算表'],
    otherTool: '',
    referenceFileNames: ['sample.xlsx'],
    preferredDate: '2026-08-05',
    preferredTime: '上午',
    otherTime: '',
    budgetChoice: '希望牧茗先協助評估',
    budgetRange: ''
  };

  Logger.log(handleWorkflowRequest_(payload).getContent());
}

function testGetRequestContext() {
  var result = getRequestContext_('WF-20260726-001', 'workflow');
  Logger.log(JSON.stringify(result, null, 2));
}

function testAppointmentBookingPhone() {
  var payload = {
    type: 'appointmentBooking',
    requestId: 'WF-20260726-001',
    source: 'workflow',
    appointmentType: 'phoneConsultation'
  };

  Logger.log(handleAppointmentBooking_(payload).getContent());
}

function testAppointmentBookingOnsite() {
  var payload = {
    type: 'appointmentBooking',
    requestId: 'CS-20260726-001',
    source: 'consultation',
    appointmentType: 'onsiteConsultation',
    date: '2026-08-05',
    period: 'afternoon',
    onsiteAddress: '桃園市平鎮區測試地址'
  };

  Logger.log(handleAppointmentBooking_(payload).getContent());
}
