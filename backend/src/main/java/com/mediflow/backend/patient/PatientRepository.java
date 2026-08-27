package com.mediflow.backend.patient;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface PatientRepository extends JpaRepository<Patient, String> {

    @EntityGraph(attributePaths = "diagnoses")
    @Query("select p from Patient p where p.id = :registrationNumber")
    Optional<Patient> findByRegistrationNumber(@Param("registrationNumber") String registrationNumber);

    @EntityGraph(attributePaths = "diagnoses")
    @Query("""
            select distinct p from Patient p left join p.diagnoses diagnosis
            where :query = ''
               or lower(p.id) like lower(concat('%', :query, '%'))
               or lower(p.name) like lower(concat('%', :query, '%'))
               or lower(coalesce(p.phone, '')) like lower(concat('%', :query, '%'))
               or lower(coalesce(p.chiefComplaint, '')) like lower(concat('%', :query, '%'))
               or lower(coalesce(p.department, '')) like lower(concat('%', :query, '%'))
               or lower(diagnosis) like lower(concat('%', :query, '%'))
            order by p.lastVisit desc, p.name asc
            """)
    List<Patient> search(@Param("query") String query);
}
