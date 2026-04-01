export const OCR_PROVIDER_VALUES = ['gemini', 'lmstudio', 'ollama'];
export const LOCAL_OCR_PROVIDERS = new Set(['lmstudio', 'ollama']);

export const DEFAULT_PROVIDER_CONNECTIONS = {
  lmstudio: {
    host: '127.0.0.1',
    port: 1234,
  },
  ollama: {
    host: '127.0.0.1',
    port: 11434,
  },
};

const normalizeHost = (value, fallbackValue) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallbackValue;
};

const normalizePort = (value, fallbackValue) => {
  const parsedValue = Number(value);
  const normalizedValue = Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : fallbackValue;
  return normalizedValue >= 1 && normalizedValue <= 65535 ? normalizedValue : fallbackValue;
};

export const normalizeOcrProvider = (value) => (
  OCR_PROVIDER_VALUES.includes(value) ? value : 'gemini'
);

export const normalizeProviderConnection = (provider, value) => {
  const defaults = DEFAULT_PROVIDER_CONNECTIONS[provider];
  return {
    host: normalizeHost(value?.host, defaults.host),
    port: normalizePort(value?.port, defaults.port),
  };
};

export const buildProviderBaseUrl = (connection) => {
  const host = typeof connection?.host === 'string' ? connection.host.trim() : '';
  const port = Number(connection?.port);

  if (!host) {
    throw new Error('A valid host is required.');
  }

  const normalizedHost = host.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(normalizedHost)) {
    const url = new URL(normalizedHost);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      url.port = String(port);
    }
    return url.toString().replace(/\/$/, '');
  }

  return `http://${normalizedHost}:${normalizePort(port, 80)}`;
};

const parseJsonPayload = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const details = payload?.error || payload?.message || response.statusText || fallbackMessage;
    throw new Error(details);
  }

  return payload;
};

const parseStructuredContent = (value, provider) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(`${provider} returned an empty response.`);
  }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : text;
  return JSON.parse(jsonText);
};

const describeAutodetectedModel = (provider, parts) => {
  const description = parts.filter(Boolean).join(' • ').trim();
  if (description) {
    return description;
  }

  return provider === 'lmstudio'
    ? 'Autodetected from LM Studio'
    : 'Autodetected from Ollama';
};

const uniqueModels = (models) => models.filter((model, index, collection) => (
  collection.findIndex((entry) => entry.provider === model.provider && entry.id === model.id) === index
));

export const sanitizeOcrModel = (model) => {
  const provider = normalizeOcrProvider(model?.provider);
  const id = typeof model?.id === 'string' ? model.id.trim() : '';
  if (!id) {
    return null;
  }

  const name = typeof model?.name === 'string' && model.name.trim() ? model.name.trim() : id;
  const description = typeof model?.description === 'string' && model.description.trim()
    ? model.description.trim()
    : 'Custom';

  return {
    id,
    name,
    description,
    provider,
    isCustom: model?.isCustom === true,
    isAutodetected: model?.isAutodetected === true,
  };
};

export const autodetectLmStudioModels = async (
  connection,
  fetchImpl = fetch
) => {
  const baseUrl = buildProviderBaseUrl(connection);
  const response = await fetchImpl(`${baseUrl}/api/v0/models`);
  const payload = await parseJsonPayload(response, 'Failed to load LM Studio models');
  const rawModels = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

  return uniqueModels(rawModels
    .map((entry) => {
      const id = typeof entry?.id === 'string'
        ? entry.id.trim()
        : (typeof entry?.modelKey === 'string' ? entry.modelKey.trim() : '');
      if (!id) {
        return null;
      }

      const type = typeof entry?.type === 'string' ? entry.type.trim().toUpperCase() : '';
      const state = typeof entry?.state === 'string' ? entry.state.trim() : '';
      const arch = typeof entry?.arch === 'string' ? entry.arch.trim() : '';

      return sanitizeOcrModel({
        id,
        name: typeof entry?.displayName === 'string' && entry.displayName.trim()
          ? entry.displayName.trim()
          : (typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : id),
        description: describeAutodetectedModel('lmstudio', [type, arch, state]),
        provider: 'lmstudio',
        isAutodetected: true,
      });
    })
    .filter(Boolean));
};

export const autodetectOllamaModels = async (
  connection,
  fetchImpl = fetch
) => {
  const baseUrl = buildProviderBaseUrl(connection);
  const response = await fetchImpl(`${baseUrl}/api/tags`);
  const payload = await parseJsonPayload(response, 'Failed to load Ollama models');
  const rawModels = Array.isArray(payload?.models) ? payload.models : [];

  return uniqueModels(rawModels
    .map((entry) => {
      const id = typeof entry?.model === 'string'
        ? entry.model.trim()
        : (typeof entry?.name === 'string' ? entry.name.trim() : '');
      if (!id) {
        return null;
      }

      const parameterSize = typeof entry?.details?.parameter_size === 'string'
        ? entry.details.parameter_size.trim()
        : '';
      const families = Array.isArray(entry?.details?.families)
        ? entry.details.families.join(', ')
        : (typeof entry?.details?.family === 'string' ? entry.details.family.trim() : '');

      return sanitizeOcrModel({
        id,
        name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : id,
        description: describeAutodetectedModel('ollama', [parameterSize, families]),
        provider: 'ollama',
        isAutodetected: true,
      });
    })
    .filter(Boolean));
};

const createLmStudioResponseFormat = (responseSchema) => ({
  type: 'json_schema',
  json_schema: {
    name: 'ocr_response',
    strict: true,
    schema: responseSchema,
  },
});

export const requestStructuredOutputFromLmStudio = async ({
  connection,
  modelName,
  prompt,
  responseSchema,
  image,
  fetchImpl = fetch,
}) => {
  const baseUrl = buildProviderBaseUrl(connection);
  const userContent = [
    { type: 'text', text: prompt },
  ];

  if (image?.base64Image && image?.mimeType) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64Image}`,
      },
    });
  }

  const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
      response_format: createLmStudioResponseFormat(responseSchema),
      temperature: 0.1,
      stream: false,
    }),
  });

  const payload = await parseJsonPayload(response, 'LM Studio request failed');
  const content = payload?.choices?.[0]?.message?.content;
  return parseStructuredContent(content, 'LM Studio');
};

export const requestStructuredOutputFromOllama = async ({
  connection,
  modelName,
  prompt,
  responseSchema,
  image,
  fetchImpl = fetch,
}) => {
  const baseUrl = buildProviderBaseUrl(connection);
  const message = {
    role: 'user',
    content: prompt,
  };

  if (image?.base64Image) {
    message.images = [image.base64Image];
  }

  const response = await fetchImpl(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [message],
      format: responseSchema,
      options: {
        temperature: 0.1,
      },
      stream: false,
    }),
  });

  const payload = await parseJsonPayload(response, 'Ollama request failed');
  const content = payload?.message?.content;
  return parseStructuredContent(content, 'Ollama');
};
