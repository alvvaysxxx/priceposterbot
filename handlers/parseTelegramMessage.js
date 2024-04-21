const parseTelegramMessage = (telegramData) => {
  const text = telegramData.message.text || telegramData.message.caption;
  const entities =
    telegramData.message.entities || telegramData.message.caption_entities;

  if (!entities) {
    return text;
  }

  let tags = [];

  entities.forEach((entity) => {
    const startTag = getTag(entity, text);
    let searchTag = tags.filter((tag) => tag.index === entity.offset);
    if (searchTag.length > 0) searchTag[0].tag += startTag;
    else
      tags.push({
        index: entity.offset,
        tag: startTag,
      });

    const closeTag =
      startTag.indexOf("<a ") === 0 ? "</a>" : "</" + startTag.slice(1);
    searchTag = tags.filter(
      (tag) => tag.index === entity.offset + entity.length
    );
    if (searchTag.length > 0) searchTag[0].tag = closeTag + searchTag[0].tag;
    else
      tags.push({
        index: entity.offset + entity.length,
        tag: closeTag,
      });
  });
  let html = "";
  for (let i = 0; i < text.length; i++) {
    const tag = tags.filter((tag) => tag.index === i);
    tags = tags.filter((tag) => tag.index !== i);
    if (tag.length > 0) html += tag[0].tag;
    html += text[i];
  }
  if (tags.length > 0) html += tags[0].tag;

  return html;
};

const getTag = (entity, text) => {
  const entityText = text.slice(entity.offset, entity.offset + entity.length);

  switch (entity.type) {
    case "bold":
      return `<strong>`;
    case "text_link":
      return `<a href="${entity.url}" target="_blank">`;
    case "url":
      return `<a href="${entityText}" target="_blank">`;
    case "italic":
      return `<em>`;
    case "code":
      return `<code>`;
    case "strikethrough":
      return `<s>`;
    case "underline":
      return `<u>`;
    case "pre":
      return `<pre>`;
    case "mention":
      return `<a href="https://t.me/${entityText.replace(
        "@",
        ""
      )}" target="_blank">`;
    case "email":
      return `<a href="mailto:${entityText}">`;
    case "phone_number":
      return `<a href="tel:${entityText}">`;
    case "blockquote":
      return `<blockquote>`;
  }
};

module.exports = parseTelegramMessage