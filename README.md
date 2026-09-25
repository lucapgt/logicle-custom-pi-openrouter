<h1 align="center" style="border-bottom: none">
  <div>
    <a href="https://logicle.ai">
      <img src="./logicle/public/logo.png" width="90" />
      <br>
      Logicle
    </a>
  </div>
</h1>

<h2 align="center">logicle-custom-pi-openrouter</h2>

<p align="center">
  <strong>Custom Logicle fork with Pi Agent / Satellite integration, OpenRouter, dynamic model discovery, OpenAI-compatible backends and global theme support.</strong>
</p>

> This repository is a customized fork of <strong>Logicle</strong>. It keeps the upstream Logicle feature set, while adding and maintaining a separate set of custom integrations and UI/backend changes described below.

## 🚀 What this custom fork adds

The custom work in **logicle-custom-pi-openrouter** is intentionally kept in source code, without runtime patching of compiled JavaScript.

### 🤖 Pi Agent / Satellite integration

- Native source-level **Satellite / Pi Agent** integration.
- Reverse inference from Satellite/Pi back into the active Logicle language model.
- Parent tool-call tracking and inference context propagation.
- MCP sampling conversion.
- Tool-call and tool-result bridging.
- Streaming support for text and tool-use events.

### 🌐 OpenRouter support

- Native **OpenRouter** backend provider.
- Dynamic model discovery from OpenRouter.
- Model metadata support including context length, vision and tool/function-calling capabilities when available.
- OpenRouter authentication handled directly by the provider implementation.

### 🔌 OpenAI-compatible backends

- Configurable OpenAI-compatible endpoint.
- Dynamic model discovery through `/models`.
- Optional manual **Model IDs** field.
- Manual model IDs are merged with discovered models and act as a fallback when `/models` is unavailable.
- API key is optional, allowing use with local inference servers that do not require authentication.

### 🧠 Dynamic model discovery

Model lists are no longer limited to a static catalog for the custom providers:

| Provider | Model discovery |
| --- | --- |
| OpenAI | Dynamic via `/v1/models`, with known Logicle metadata preserved where available |
| OpenRouter | Dynamic via OpenRouter model API |
| OpenAI-compatible | Dynamic via `/models` + optional manual model IDs |

This allows newly available models to appear without having to edit the Logicle source catalog first.

### 🎨 Theme support

- Global **Light**
- Global **Dark**
- **System** theme following the operating-system preference
- Theme preference persists across the application

### 🛠 Assistant tools

The assistant **Tools** tab remains visible independently of the selected model capability metadata. This is useful because the section also contains Satellite/Pi integrations and other assistant-level tools.

More implementation details are documented in [CUSTOM_FEATURES.md](./docs/CUSTOM_FEATURES.md).

---

## ⭐️ About Logicle

Logicle is an open-source ChatGPT Enterprise alternative designed for flexible self-hosting, extensibility and integration with commercial and open-source LLM providers.

This fork preserves the standard Logicle capabilities, including:

- **👥 Multi-user access** with user/admin authorization.
- **🔗 SSO integration** with OIDC and SAML 2.0 providers.
- **⚙️ Admin configuration UI**.
- **🔒 Self-hosted and local inference support**.
- **🛢️ SQLite and PostgreSQL support**.
- **🤖 Custom AI assistants and knowledge integrations**.

## 🚀 Quick try

After the CI pipeline on the custom branch succeeds, the Docker image is published to GitHub Container Registry.

```bash
docker run -d --name logicle \
  -p 3000:3000 \
  ghcr.io/lucapgt/logicle-custom-pi-openrouter:latest
```

Then open [http://localhost:3000](http://localhost:3000).

If the GHCR package has not yet been made public, open the package settings on GitHub once and change its visibility to **Public**. Public pulls then require no registry credentials.

### Build locally

```bash
git clone https://github.com/lucapgt/logicle-custom-pi-openrouter.git
cd logicle-custom-pi-openrouter
docker build -t logicle-custom:latest .
```

Run the locally built image:

```bash
docker run -d --name logicle \
  -p 3000:3000 \
  logicle-custom:latest
```

## Kubernetes / Helm

The fork also publishes a dedicated Helm package:

```text
oci://ghcr.io/lucapgt/logicle-custom-pi-openrouter-helm
```

The Helm package is intentionally separate from the Docker image package to keep the two OCI artifact types unambiguous.

## Self-Hosting


Logicle supports Docker, Docker Compose and Kubernetes deployments.

For detailed deployment instructions, see the [Self-Hosting Documentation](./deploy/README.md).

## Testing

For the test strategy and procedure, including smoke, integration and LLM provider coverage, see [TESTING.md](./TESTING.md).

The custom fork is also validated through GitHub Actions before publishing the `latest` container image.

## Upstream project

This repository is based on the upstream Logicle project:

- Upstream repository: `logicleai/logicle`
- Custom fork: `lucapgt/logicle-custom-pi-openrouter`

Upstream changes can continue to be incorporated while keeping the custom Pi/OpenRouter/OpenAI-compatible functionality maintained in this fork.

## Licensing Information

Logicle and this fork are distributed under the **GNU Affero General Public License v3.0 (AGPLv3)**. See [LICENSE](./LICENSE).
