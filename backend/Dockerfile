FROM eclipse-temurin:17-jdk AS build
WORKDIR /workspace
COPY gradlew gradlew.bat settings.gradle build.gradle ./
COPY gradle ./gradle
COPY src ./src
RUN chmod +x gradlew && ./gradlew bootJar --no-daemon

FROM eclipse-temurin:17-jre
RUN useradd --system --uid 10001 --create-home mediflow \
    && mkdir -p /app/data \
    && chown -R mediflow:mediflow /app
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar /app/mediflow.jar
USER mediflow
VOLUME ["/app/data"]
EXPOSE 8080
ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/urandom", "-jar", "/app/mediflow.jar"]
