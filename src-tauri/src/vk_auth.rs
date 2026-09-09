use serde::{Deserialize, Serialize};

const VK_WEB_CLIENT_ID: &str = "54761285";
const VK_WEB_REDIRECT_URI: &str = "https://g-kylexy.github.io/Vkomic/vk-callback.html";
const VK_TOKEN_ENDPOINT: &str = "https://id.vk.ru/oauth2/auth";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VkAuthSession {
    access_token: String,
    refresh_token: String,
    device_id: String,
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct VkTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    device_id: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

fn validate_oauth_value(name: &str, value: &str, max_len: usize) -> Result<(), String> {
    if value.is_empty() || value.len() > max_len || value.chars().any(char::is_whitespace) {
        return Err(format!("Paramètre OAuth invalide : {name}"));
    }
    Ok(())
}

async fn parse_token_response(
    response: reqwest::Response,
    expected_state: &str,
    fallback_device_id: &str,
) -> Result<VkAuthSession, String> {
    let status = response.status();
    let data: VkTokenResponse = response
        .json()
        .await
        .map_err(|_| "Réponse VK ID illisible".to_string())?;

    if !status.is_success() || data.error.is_some() {
        return Err(data
            .error_description
            .or(data.error)
            .unwrap_or_else(|| "VK ID a refusé la connexion".to_string()));
    }
    if data
        .state
        .as_deref()
        .is_some_and(|state| state != expected_state)
    {
        return Err("La réponse VK ID ne correspond pas à la demande".to_string());
    }

    Ok(VkAuthSession {
        access_token: data
            .access_token
            .ok_or_else(|| "VK ID n'a pas renvoyé de jeton d'accès".to_string())?,
        refresh_token: data
            .refresh_token
            .ok_or_else(|| "VK ID n'a pas renvoyé de jeton de renouvellement".to_string())?,
        device_id: data
            .device_id
            .unwrap_or_else(|| fallback_device_id.to_string()),
        expires_in: data.expires_in.unwrap_or(3600).max(60),
    })
}

pub async fn exchange_code(
    code: String,
    device_id: String,
    state: String,
    code_verifier: String,
) -> Result<VkAuthSession, String> {
    validate_oauth_value("code", &code, 4096)?;
    validate_oauth_value("device_id", &device_id, 512)?;
    validate_oauth_value("state", &state, 128)?;
    validate_oauth_value("code_verifier", &code_verifier, 128)?;

    let response = reqwest::Client::new()
        .post(VK_TOKEN_ENDPOINT)
        .query(&[
            ("grant_type", "authorization_code"),
            ("redirect_uri", VK_WEB_REDIRECT_URI),
            ("client_id", VK_WEB_CLIENT_ID),
            ("code_verifier", code_verifier.as_str()),
            ("state", state.as_str()),
            ("device_id", device_id.as_str()),
        ])
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(format!("code={}", urlencoding::encode(&code)))
        .send()
        .await
        .map_err(|_| "Impossible de joindre VK ID".to_string())?;

    parse_token_response(response, &state, &device_id).await
}

pub async fn refresh_token(
    refresh_token: String,
    device_id: String,
    state: String,
) -> Result<VkAuthSession, String> {
    validate_oauth_value("refresh_token", &refresh_token, 4096)?;
    validate_oauth_value("device_id", &device_id, 512)?;
    validate_oauth_value("state", &state, 128)?;

    let response = reqwest::Client::new()
        .post(VK_TOKEN_ENDPOINT)
        .query(&[
            ("grant_type", "refresh_token"),
            ("redirect_uri", VK_WEB_REDIRECT_URI),
            ("client_id", VK_WEB_CLIENT_ID),
            ("device_id", device_id.as_str()),
            ("state", state.as_str()),
        ])
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(format!(
            "refresh_token={}",
            urlencoding::encode(&refresh_token)
        ))
        .send()
        .await
        .map_err(|_| "Impossible de joindre VK ID".to_string())?;

    parse_token_response(response, &state, &device_id).await
}
