package com.mediflow.backend.security;

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class KakaoOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    private final DefaultOAuth2UserService delegate = new DefaultOAuth2UserService();

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
        OAuth2User user = delegate.loadUser(request);
        Object rawId = user.getAttributes().get("id");
        if (rawId == null) {
            throw new OAuth2AuthenticationException("카카오 회원번호를 확인할 수 없습니다.");
        }

        String nickname = "카카오 사용자";
        Object accountValue = user.getAttributes().get("kakao_account");
        if (accountValue instanceof Map<?, ?> account) {
            Object profileValue = account.get("profile");
            if (profileValue instanceof Map<?, ?> profile && profile.get("nickname") != null) {
                nickname = String.valueOf(profile.get("nickname"));
            }
        }

        return new KakaoPrincipal(String.valueOf(rawId), nickname, user.getAttributes());
    }
}
