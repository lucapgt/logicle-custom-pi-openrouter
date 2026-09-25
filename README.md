<h1 align="center" style="border-bottom: none">
    <div>
        <a href="https://logicle.ai">
            <img src="./logicle/public/logo.png" width="90" />
            <br>
            Logicle
        </a>
    </div>
    The Open Source ChatGPT Enterprise Alternative <br>
</h1>

## ⭐️ Why Logicle?
Logicle was created to enable companies of all sizes to adopt Generative AI with no initial investment and total flexibility.
Our platform is built for full extensibility, allowing seamless integration with any company system CRM, legacy ERP, or custom software and compatibility with any commercial and open-source LLM provider, ensuring your company data remains free from vendor lock-in.


## 🔧 Custom fork features

This fork keeps the standard Logicle feature set and adds:

- Native **OpenRouter** support with dynamic model discovery.
- **OpenAI** dynamic model discovery while preserving known Logicle model metadata when available.
- **OpenAI-compatible** backends with configurable endpoint, dynamic `/models` discovery, and optional manual model IDs as fallback.
- **Pi Agent / Satellite** integration, including reverse inference and tool-use bridging.
- Global **Light / Dark / System** theme support.

More details are available in [CUSTOM_FEATURES.md](./docs/CUSTOM_FEATURES.md).

## ✨ Features

- **👥 Enhanced Multi-User Access**: Streamline onboarding with multi-user support, featuring dual-level authorization for users and admins.

- **🔗 SSO Integration**: Easily integrate with leading Enterprise SSO providers (Microsoft Entra ID, Okta, ADFS, Auth0, Google Workspace SSO), supporting OIDC and SAML 2.0.

- **⚙️ Simplified Configuration**: Quickly customize settings via a user-friendly admin UI for effortless setup and integration.

- **🔒 Security**: Integrate seamlessly with open-source inference servers like Ollama and Local.ai, enabling secure AI services even in air-gapped environments.

- **🛢️ Database Flexibility**: Choose between SQLite for small-scale use and Postgres for enterprise deployments.

- **🤖 Custom AI Assistants**: Deploy specialized AI assistants with tailored knowledge for precise task execution.

## 🚀 Quick try

The `pi-openrouter` branch publishes a Docker image to GitHub Container Registry after the full CI pipeline succeeds.

```bash
docker run -d --name logicle \
  -p 3000:3000 \
  ghcr.io/lucapgt/logicle-custom-pi-openrouter:latest
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

If the GHCR package has not yet been made public, open the package settings on GitHub once and change its visibility to **Public**. No extra registry credentials are needed after that for public pulls.

To build the fork locally instead:

```bash
git clone https://github.com/lucapgt/logicle-custom-pi-openrouter.git
cd logicle-custom-pi-openrouter
git checkout pi-openrouter
docker build -t logicle-custom:latest .
```

## Self-Hosting

Logicle offers flexible deployment options, including Docker, Docker Compose, and Kubernetes, to best suit your self-hosting needs.

For detailed instructions on how to deploy Logicle using these methods, please refer to our [Self-Hosting Documentation](./deploy/README.md).

## Testing

For the project testing strategy and procedure (smoke, integration, and LLM provider coverage), see [TESTING.md](./TESTING.md).

## Licensing Information

Logicle is made available under the AGPLv3 license. For more information about the terms and conditions, please view the [license file](./LICENSE).
