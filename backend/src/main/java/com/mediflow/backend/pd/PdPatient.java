package com.mediflow.backend.pd;

import com.mediflow.backend.security.SensitiveDataCrypto;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="pd_patients", indexes={@Index(name="idx_pd_patient_name", columnList="name_index"), @Index(name="idx_pd_patient_birth", columnList="birth6_index")})
public class PdPatient {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @Column(name="name_cipher", nullable=false, length=800) private String nameCipher;
    @Column(name="name_index", nullable=false, length=64) private String nameIndex;
    @Column(name="birth6_cipher", nullable=false, length=800) private String birth6Cipher;
    @Column(name="birth6_index", nullable=false, length=64) private String birth6Index;
    @Column(nullable=false, length=10) private String sex;
    @Column(nullable=false, updatable=false) private Instant createdAt;
    protected PdPatient() {}
    public PdPatient(String name, String birth6, String sex, SensitiveDataCrypto crypto) {
        this.nameCipher=crypto.encrypt(name); this.nameIndex=crypto.blindIndex(name);
        this.birth6Cipher=crypto.encrypt(birth6); this.birth6Index=crypto.blindIndex(birth6);
        this.sex=sex; this.createdAt=Instant.now();
    }
    public UUID getId(){return id;} public String getNameCipher(){return nameCipher;}
    public String getBirth6Cipher(){return birth6Cipher;} public String getNameIndex(){return nameIndex;}
    public String getBirth6Index(){return birth6Index;} public String getSex(){return sex;} public Instant getCreatedAt(){return createdAt;}
}
