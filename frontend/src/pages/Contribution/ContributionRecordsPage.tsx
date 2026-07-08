import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import {
  createContributionRecord,
  deleteContributionRecord,
  fetchAllContributionRecords,
  updateContributionRecord,
} from '../../services/contributionService';
import { fetchAllEmployees } from '../../services/employeeService';
import { ContributionSource } from '../../types/common';
import { ContributionRecord } from '../../types/contribution';
import { Employee } from '../../types/employee';

const SOURCE_LABELS: Record<ContributionSource, string> = {
  [ContributionSource.PM_EVALUATION]: 'PM Evaluation',
  [ContributionSource.SKILL_VERIFICATION]: 'Skill Verification',
  [ContributionSource.TASK_COMPLETION]: 'Task Completion',
  [ContributionSource.COMPANY_CONTRIBUTION]: 'Company Contribution',
  [ContributionSource.COMPANY_REWARD]: 'Company Reward',
};

const SOURCE_COLORS: Record<ContributionSource, string> = {
  [ContributionSource.PM_EVALUATION]: 'blue',
  [ContributionSource.SKILL_VERIFICATION]: 'purple',
  [ContributionSource.TASK_COMPLETION]: 'green',
  [ContributionSource.COMPANY_CONTRIBUTION]: 'gold',
  [ContributionSource.COMPANY_REWARD]: 'magenta',
};

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function ContributionRecordsPage() {
  const [records, setRecords] = useState<ContributionRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ContributionRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [allRecords, allEmployees] = await Promise.all([fetchAllContributionRecords(), fetchAllEmployees()]);
      setRecords(allRecords);
      setEmployees(allEmployees);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record: ContributionRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      employeeId: record.employeeId,
      source: record.source,
      points: record.points,
      recordDate: dayjs(record.recordDate),
      description: record.description,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, recordDate: values.recordDate.format('YYYY-MM-DD') };
    setSaving(true);
    try {
      if (editingRecord) {
        await updateContributionRecord(editingRecord.id, payload);
        message.success('Contribution record updated');
      } else {
        await createContributionRecord(payload);
        message.success('Contribution record created');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save contribution record'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: ContributionRecord) => {
    await deleteContributionRecord(record.id);
    message.success('Contribution record deleted');
    loadData();
  };

  const filteredRecords = employeeFilter ? records.filter((r) => r.employeeId === employeeFilter) : records;

  return (
    <Card
      title="Contribution & Performance Records"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Add Record
        </Button>
      }
    >
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by employee"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          options={employees.map((e) => ({ value: e.id, label: e.fullName }))}
          onChange={setEmployeeFilter}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredRecords}
        columns={[
          { title: 'Employee', dataIndex: ['employee', 'fullName'], render: (v: string | undefined) => v ?? '—' },
          {
            title: 'Source',
            dataIndex: 'source',
            render: (source: ContributionSource) => <Tag color={SOURCE_COLORS[source]}>{SOURCE_LABELS[source]}</Tag>,
          },
          { title: 'Points', dataIndex: 'points' },
          { title: 'Date', dataIndex: 'recordDate' },
          { title: 'Description', dataIndex: 'description' },
          {
            title: 'Actions',
            render: (_, record: ContributionRecord) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                  Edit
                </Button>
                <Popconfirm title="Delete this contribution record?" onConfirm={() => handleDelete(record)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingRecord ? 'Edit contribution record' : 'Add contribution record'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={employees.map((e) => ({ value: e.id, label: e.fullName }))}
            />
          </Form.Item>
          <Form.Item name="source" label="Source" rules={[{ required: true }]}>
            <Select options={Object.values(ContributionSource).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))} />
          </Form.Item>
          <Form.Item name="points" label="Points" rules={[{ required: true }]}>
            <InputNumber step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="recordDate" label="Record date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
