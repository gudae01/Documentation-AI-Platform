package com.mediflow.backend.patient;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "patients")
public class Patient {

    @Id
    @Column(name = "patient_id", length = 40)
    private String id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 20)
    private String gender;

    @Column(nullable = false)
    private LocalDate birthDate;

    @Column(length = 30)
    private String phone;

    @Column(length = 250)
    private String address;

    private LocalDate lastVisit;

    @Column(nullable = false)
    private int visitCount;

    @Column(length = 500)
    private String chiefComplaint;

    @Column(length = 500)
    private String allergies;

    @Column(length = 120)
    private String department;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "patient_diagnoses", joinColumns = @JoinColumn(name = "patient_id"))
    @Column(name = "diagnosis", length = 200, nullable = false)
    private List<String> diagnoses = new ArrayList<>();

    protected Patient() {
    }

    public Patient(String id, String name, String gender, LocalDate birthDate, String phone, String address,
                   LocalDate lastVisit, int visitCount, String chiefComplaint, String allergies,
                   String department, List<String> diagnoses) {
        this.id = id;
        this.name = name;
        this.gender = gender;
        this.birthDate = birthDate;
        this.phone = phone;
        this.address = address;
        this.lastVisit = lastVisit;
        this.visitCount = visitCount;
        this.chiefComplaint = chiefComplaint;
        this.allergies = allergies;
        this.department = department;
        this.diagnoses = new ArrayList<>(diagnoses);
    }

    public void registerApprovedVisit(LocalDate visitDate, String latestChiefComplaint) {
        this.lastVisit = visitDate;
        this.visitCount += 1;
        if (latestChiefComplaint != null && !latestChiefComplaint.isBlank()) {
            this.chiefComplaint = latestChiefComplaint;
        }
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getGender() {
        return gender;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public String getPhone() {
        return phone;
    }

    public String getAddress() {
        return address;
    }

    public LocalDate getLastVisit() {
        return lastVisit;
    }

    public int getVisitCount() {
        return visitCount;
    }

    public String getChiefComplaint() {
        return chiefComplaint;
    }

    public String getAllergies() {
        return allergies;
    }

    public String getDepartment() {
        return department;
    }

    public List<String> getDiagnoses() {
        return List.copyOf(diagnoses);
    }
}
