import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsultaEmpresasComponent } from './consulta-empresas.component';

describe('ConsultaEmpresasComponent', () => {
  let component: ConsultaEmpresasComponent;
  let fixture: ComponentFixture<ConsultaEmpresasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConsultaEmpresasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConsultaEmpresasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
