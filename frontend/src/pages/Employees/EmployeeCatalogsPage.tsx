import { useEffect, useState } from 'react';
import { Card, Space, Form, Input, InputNumber, Button, Typography, Table, Tag, Modal, Popconfirm, message } from 'antd';
import axios from 'axios';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  fetchAllEmployeeLevels,
  createEmployeeLevel,
  updateEmployeeLevel,
  deleteEmployeeLevel,
} from '../../services/employeeLevelService';
import {
  fetchAllEmployeeRoles,
  createEmployeeRole,
  updateEmployeeRole,
  deleteEmployeeRole,
} from '../../services/employeeRoleService';
import { EmployeeLevel } from '../../types/employeeLevel';
import { EmployeeRole } from '../../types/employeeRole';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function EmployeeCatalogsPage() {
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([]);
  const [loadingEmployeeRoles, setLoadingEmployeeRoles] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<EmployeeRole | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [roleForm] = Form.useForm();

  const [employeeLevels, setEmployeeLevels] = useState<EmployeeLevel[]>([]);
  const [loadingEmployeeLevels, setLoadingEmployeeLevels] = useState(false);
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<EmployeeLevel | null>(null);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelForm] = Form.useForm();

  const loadEmployeeRoles = async () => {
    setLoadingEmployeeRoles(true);
    try {
      setEmployeeRoles(await fetchAllEmployeeRoles());
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load employee roles'));
    } finally {
      setLoadingEmployeeRoles(false);
    }
  };

  const loadEmployeeLevels = async () => {
    setLoadingEmployeeLevels(true);
    try {
      setEmployeeLevels(await fetchAllEmployeeLevels());
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load employee levels'));
    } finally {
      setLoadingEmployeeLevels(false);
    }
  };

  useEffect(() => {
    loadEmployeeRoles();
    loadEmployeeLevels();
  }, []);

  const openRoleCreateModal = () => {
    setEditingRole(null);
    roleForm.resetFields();
    setRoleModalOpen(true);
  };

  const openRoleEditModal = (role: EmployeeRole) => {
    setEditingRole(role);
    roleForm.setFieldsValue({ name: role.name, sortOrder: role.sortOrder });
    setRoleModalOpen(true);
  };

  const handleRoleSubmit = async () => {
    const values = await roleForm.validateFields();
    setSavingRole(true);
    try {
      if (editingRole) {
        await updateEmployeeRole(editingRole.id, values);
        message.success('Employee role updated');
      } else {
        await createEmployeeRole(values);
        message.success('Employee role created');
      }
      setRoleModalOpen(false);
      await loadEmployeeRoles();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save employee role'));
    } finally {
      setSavingRole(false);
    }
  };

  const handleRoleDelete = async (role: EmployeeRole) => {
    try {
      await deleteEmployeeRole(role.id);
      message.success('Employee role deleted');
      await loadEmployeeRoles();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete employee role'));
    }
  };

  const openLevelCreateModal = () => {
    setEditingLevel(null);
    levelForm.resetFields();
    setLevelModalOpen(true);
  };

  const openLevelEditModal = (level: EmployeeLevel) => {
    setEditingLevel(level);
    levelForm.setFieldsValue({ name: level.name, sortOrder: level.sortOrder });
    setLevelModalOpen(true);
  };

  const handleLevelSubmit = async () => {
    const values = await levelForm.validateFields();
    setSavingLevel(true);
    try {
      if (editingLevel) {
        await updateEmployeeLevel(editingLevel.id, values);
        message.success('Employee level updated');
      } else {
        await createEmployeeLevel(values);
        message.success('Employee level created');
      }
      setLevelModalOpen(false);
      await loadEmployeeLevels();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save employee level'));
    } finally {
      setSavingLevel(false);
    }
  };

  const handleLevelDelete = async (level: EmployeeLevel) => {
    try {
      await deleteEmployeeLevel(level.id);
      message.success('Employee level deleted');
      await loadEmployeeLevels();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete employee level'));
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        title="Employee Roles"
        extra={
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openRoleCreateModal}>
            Add Role
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Roles assignable to an employee. Note: this catalog doesn't drive real permissions — the app's actual
          access checks stay hardcoded to 5 role names (developer, tech_lead, pm, hr, admin). Renaming or deleting
          one of those breaks that person's real permissions; a brand-new role name has no permissions anywhere
          until matching backend code is written.
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          loading={loadingEmployeeRoles}
          pagination={false}
          dataSource={employeeRoles}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (name: string) => <Tag color="blue">{name}</Tag> },
            { title: 'Sort Order', dataIndex: 'sortOrder' },
            {
              title: 'Actions',
              render: (_, role: EmployeeRole) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openRoleEditModal(role)}>
                    Edit
                  </Button>
                  <Popconfirm
                    title="Delete this employee role?"
                    description="Blocked if any employee currently holds this role."
                    onConfirm={() => handleRoleDelete(role)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="Employee Levels"
        extra={
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openLevelCreateModal}>
            Add Level
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The overall career levels employees can be assigned (distinct from per-skill proficiency levels in the
          Skill Catalog). Used by the Level field on the Employees page and the Jira quick-create form.
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          loading={loadingEmployeeLevels}
          pagination={false}
          dataSource={employeeLevels}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Sort Order', dataIndex: 'sortOrder' },
            {
              title: 'Actions',
              render: (_, level: EmployeeLevel) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openLevelEditModal(level)}>
                    Edit
                  </Button>
                  <Popconfirm
                    title="Delete this employee level?"
                    description="Blocked if any employee currently holds this level."
                    onConfirm={() => handleLevelDelete(level)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingRole ? 'Edit employee role' : 'Add employee role'}
        open={roleModalOpen}
        onOk={handleRoleSubmit}
        onCancel={() => setRoleModalOpen(false)}
        confirmLoading={savingRole}
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. developer, tech_lead, pm, hr, admin" />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="Sort order"
            tooltip="Lower sorts first — controls display order in Role dropdowns."
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingLevel ? 'Edit employee level' : 'Add employee level'}
        open={levelModalOpen}
        onOk={handleLevelSubmit}
        onCancel={() => setLevelModalOpen(false)}
        confirmLoading={savingLevel}
      >
        <Form form={levelForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Junior, Middle, Senior" />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="Sort order"
            tooltip="Lower sorts first — controls display order in Level dropdowns."
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
