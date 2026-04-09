// Скопируй этот код в Google Apps Script (script.google.com)
// и задеплой как веб-приложение (Execute as: Me, Who has access: Anyone)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Заголовки при первом запуске
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Дата и время',
        'Email',
        'Имя',
        'Какое видео лучше?',
        'Качество озвучки',
        'Совпадение речи и губ',
        'Мимика',
        'Качество видеоряда',
      ]);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    }

    sheet.appendRow([
      data.timestamp,
      data.email,
      data.name,
      data.q1,
      data.q2,
      data.q3,
      data.q4,
      data.q5,
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
