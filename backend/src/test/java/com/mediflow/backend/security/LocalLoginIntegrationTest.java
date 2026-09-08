package com.mediflow.backend.security;

import com.mediflow.backend.pd.QuestionnaireService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class LocalLoginIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper json;
    @Autowired UserDetailsService users;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired QuestionnaireService questionnaires;

    @Test
    void anonymousRequestsHaveNoSessionAccess() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(false));
        mockMvc.perform(get("/api/pd/questionnaires"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/oauth2/authorization/kakao"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void fixedPasswordIsHashedAndGrantsOnlyTheClinicianRole() {
        var root = users.loadUserByUsername("root");
        assertThat(root.getPassword()).isNotEqualTo("root").startsWith("$2");
        assertThat(passwordEncoder.matches("root", root.getPassword())).isTrue();
        assertThat(root.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_CLINICIAN");
    }

    @Test
    void loginRequiresCsrfAndRejectsIncorrectCredentials() throws Exception {
        mockMvc.perform(post("/api/auth/login").param("username", "root").param("password", "root"))
                .andExpect(status().isForbidden()).andExpect(unauthenticated());
        for (String[] credentials : new String[][] {{"root", "wrong"}, {"unknown", "root"}, {"root", ""}}) {
            var session = new MockHttpSession();
            var token = token(session);
            mockMvc.perform(post("/api/auth/login").session(session).cookie(token.cookie())
                            .header(token.headerName(), token.value())
                            .param("username", credentials[0]).param("password", credentials[1]))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("아이디 또는 비밀번호가 올바르지 않습니다."))
                    .andExpect(unauthenticated());
        }
    }

    @Test
    void browserLoginRotatesSessionAndCanUseFreshCsrfToApproveAndLogout() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String previousId = session.getId();
        var tokenResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse();
        var token = json.readTree(tokenResponse.getContentAsString());
        Cookie cookie = Objects.requireNonNull(tokenResponse.getCookie("XSRF-TOKEN"));

        var loginResult = mockMvc.perform(post("/api/auth/login").session(session).cookie(cookie)
                        .header(token.path("headerName").asText(), token.path("token").asText())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "root").param("password", "root"))
                .andExpect(status().isNoContent())
                .andExpect(authenticated().withUsername("root").withRoles("CLINICIAN"))
                .andReturn();
        session = (MockHttpSession) Objects.requireNonNull(loginResult.getRequest().getSession(false));
        assertThat(session.getId()).isNotEqualTo(previousId);
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.nickname").value("root"));
        mockMvc.perform(get("/api/pd/questionnaires").session(session))
                .andExpect(status().isOk());

        var invitation = questionnaires.createDirect();
        var questionnaire = questionnaires.submit(invitation.token(), json.readTree("""
                {"name":"고정로그인검증","birth6":"800101","sex":"M","plannedDate":"2026-09-07"}
                """));
        var freshTokenResponse = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse();
        var freshToken = json.readTree(freshTokenResponse.getContentAsString());
        Cookie freshCookie = Objects.requireNonNull(freshTokenResponse.getCookie("XSRF-TOKEN"));
        String headerName = freshToken.path("headerName").asText();
        String headerValue = freshToken.path("token").asText();
        mockMvc.perform(put("/api/pd/questionnaires/{id}/clinical-record", questionnaire.getId())
                        .session(session).cookie(freshCookie).header(headerName, headerValue)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"rawExaminationText":"","structuredResults":[],
                                 "soap":{"subjective":"","objective":"","assessment":"","plan":""},"autonomic":{}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clinician").value("root"));

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/auth/logout").session(session).cookie(freshCookie).header(headerName, headerValue))
                .andExpect(status().isNoContent()).andExpect(unauthenticated());
        assertThat(session.isInvalid()).isTrue();
        mockMvc.perform(get("/api/pd/questionnaires"))
                .andExpect(status().isUnauthorized());
        login();
    }

    @Test
    void aSecondLoginExpiresThePreviousSession() throws Exception {
        MockHttpSession first = login();
        MockHttpSession second = login();
        mockMvc.perform(get("/api/pd/questionnaires").session(first))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/pd/questionnaires").session(second))
                .andExpect(status().isOk());
    }

    private MockHttpSession login() throws Exception {
        var session = new MockHttpSession();
        var token = token(session);
        var result = mockMvc.perform(post("/api/auth/login").session(session).cookie(token.cookie())
                        .header(token.headerName(), token.value())
                        .param("username", "root").param("password", "root"))
                .andExpect(status().isNoContent())
                .andExpect(authenticated().withUsername("root"))
                .andReturn();
        return (MockHttpSession) Objects.requireNonNull(result.getRequest().getSession(false));
    }

    private BrowserCsrf token(MockHttpSession session) throws Exception {
        var response = mockMvc.perform(get("/api/auth/csrf").session(session))
                .andExpect(status().isOk()).andReturn().getResponse();
        var token = json.readTree(response.getContentAsString());
        return new BrowserCsrf(Objects.requireNonNull(response.getCookie("XSRF-TOKEN")),
                token.path("headerName").asText(), token.path("token").asText());
    }

    private record BrowserCsrf(Cookie cookie, String headerName, String value) { }
}
